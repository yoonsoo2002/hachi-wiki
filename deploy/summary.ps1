# Builds the zero-downtime verification summary from monitor.ps1 + deploy.ps1 output
# (Windows PowerShell 5.1). Writes Markdown to the GitHub Actions run Summary,
# prints every request to the job log, and saves summary.md next to the logs.
param(
  [Parameter(Mandatory = $true)][string]$LogDir,
  [string]$Url = 'http://127.0.0.1:8080/',
  [double]$IntervalSec = 1,
  # A pause between two requests longer than this is reported as an unverified period.
  [double]$GapLimitSec = 2.5
)

$ErrorActionPreference = 'Continue'
$utf8 = New-Object System.Text.UTF8Encoding $false
$csv = Join-Path $LogDir 'requests.csv'
$resultFile = Join-Path $LogDir 'deploy-result.json'

$rows = @()
if (Test-Path $csv) { $rows = @(Import-Csv $csv -Encoding UTF8) }
$deploy = $null
if (Test-Path $resultFile) { $deploy = Get-Content $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json }

foreach ($r in $rows) {
  $r | Add-Member -NotePropertyName ok -NotePropertyValue ($r.http -eq '200' -and $r.valid -eq 'true')
  $r | Add-Member -NotePropertyName t0 -NotePropertyValue ([DateTime]::Parse($r.start_utc, $null, 'RoundtripKind'))
  $r | Add-Member -NotePropertyName t1 -NotePropertyValue ([DateTime]::Parse($r.end_utc, $null, 'RoundtripKind'))
}

$total = $rows.Count
$okCount = @($rows | Where-Object { $_.ok }).Count
$failCount = $total - $okCount

# Request ids must be 1..N without holes.
$contiguous = $true
for ($i = 0; $i -lt $total; $i++) { if ([int]$rows[$i].seq -ne $i + 1) { $contiguous = $false } }

# Spacing between requests.
$intervals = @(); $gaps = @(); $maxGap = 0.0; $maxGapAt = ''
for ($i = 1; $i -lt $total; $i++) {
  $intervals += ($rows[$i].t0 - $rows[$i - 1].t0).TotalSeconds
  $idle = ($rows[$i].t0 - $rows[$i - 1].t1).TotalSeconds
  if ($idle -gt $maxGap) { $maxGap = $idle; $maxGapAt = "#$($rows[$i - 1].seq) -> #$($rows[$i].seq)" }
  if ($idle -gt $GapLimitSec) {
    $gaps += ('{0} to {1} ({2:N1}s, #{3} -> #{4})' -f $rows[$i - 1].t1.ToString('HH:mm:ss'), $rows[$i].t0.ToString('HH:mm:ss'), $idle, $rows[$i - 1].seq, $rows[$i].seq)
  }
}
$avgInterval = 0; $minInterval = 0; $maxInterval = 0
if ($intervals.Count -gt 0) {
  $m = $intervals | Measure-Object -Average -Minimum -Maximum
  $avgInterval = $m.Average; $minInterval = $m.Minimum; $maxInterval = $m.Maximum
}
$respMs = @($rows | Where-Object { $_.ok } | ForEach-Object { [int]$_.ms })
$avgMs = 0; $maxMs = 0
if ($respMs.Count -gt 0) { $mm = $respMs | Measure-Object -Average -Maximum; $avgMs = $mm.Average; $maxMs = $mm.Maximum }

# Version transition (in the order the monitor observed it).
$seen = @()
foreach ($r in $rows) {
  if (-not $r.ok) { continue }
  $tag = "v$($r.version) ($($r.commit))"
  if ($seen.Count -eq 0 -or $seen[-1].tag -ne $tag) { $seen += [pscustomobject]@{ tag = $tag; seq = $r.seq; t = $r.t0 } }
}
$transition = ($seen | ForEach-Object { "$($_.tag) from #$($_.seq)" }) -join ' -> '
if (-not $transition) { $transition = 'no successful response' }

$expected = ''
if ($deploy) { $expected = $deploy.expected_commit }
$after = @($rows | Where-Object { $_.phase -eq 'after' })
$afterNew = @($after | Where-Object { $_.ok -and (-not $expected -or $_.commit -eq $expected) }).Count
$initial = $false
if ($deploy) { $initial = [bool]$deploy.initial_deploy }
$deployOk = ($deploy -and $deploy.status -eq 'success')

if ($initial) {
  $relevant = @($rows | Where-Object { $_.phase -ne 'before' })
  $relevantFail = @($relevant | Where-Object { -not $_.ok -and $_.phase -eq 'after' }).Count
  $verdict = 'INITIAL DEPLOYMENT'
  if (-not $deployOk -or $relevantFail -gt 0) { $verdict = 'FAILED' }
} else {
  $verdict = 'SUCCESS'
  if (-not $deployOk -or $failCount -gt 0 -or $after.Count -eq 0 -or $afterNew -ne $after.Count -or -not $contiguous) { $verdict = 'FAILED' }
}

function Fmt([DateTime]$t) { return $t.ToString('yyyy-MM-dd HH:mm:ss.fff') + 'Z' }

$windowText = 'no requests recorded'
if ($total -gt 0) { $windowText = '{0} to {1} ({2:N1}s)' -f (Fmt $rows[0].t0), (Fmt $rows[-1].t1), ($rows[-1].t1 - $rows[0].t0).TotalSeconds }

$sb = New-Object System.Text.StringBuilder
function Add([string]$s) { [void]$sb.AppendLine($s) }

Add "## Hachi Wiki zero-downtime deployment verification"
Add ""
Add ("**Result: {0}** | Service URL: ``{1}`` | Window (UTC): {2}" -f $verdict, $Url, $windowText)
Add ""
Add ("Requests: **{0} total, {1} succeeded, {2} failed** | request ids contiguous: {3} | one request at a time, next request {4}s after each response" -f $total, $okCount, $failCount, $contiguous, $IntervalSec)
Add ""
Add "| Stage | Requests (ok/total) | Representative request | UTC start | HTTP | Valid page | Version (commit) | Served by | Time (ms) |"
Add "|---|---:|---|---|---:|---|---|---|---:|"
foreach ($stage in @('before', 'during', 'after')) {
  $part = @($rows | Where-Object { $_.phase -eq $stage })
  if ($part.Count -eq 0) { Add "| $stage | 0/0 | - | - | - | - | - | - | - |"; continue }
  $ok = @($part | Where-Object { $_.ok }).Count
  $rep = $part[[int][Math]::Floor(($part.Count - 1) / 2)]
  if ($stage -eq 'before') { $rep = $part[-1] }
  if ($stage -eq 'after') { $rep = $part[-1] }
  Add ("| {0} | {1}/{2} | #{3} | {4} | {5} | {6} | v{7} ({8}) | {9} | {10} |" -f $stage, $ok, $part.Count, $rep.seq, $rep.t0.ToString('HH:mm:ss.fff'), $rep.http, $rep.valid, $rep.version, $rep.commit, $rep.served_by, $rep.ms)
}
Add ""
Add "| Check | Value |"
Add "|---|---|"
Add ("| Version transition | {0} |" -f $transition)
if ($deploy) {
  Add ("| Deployment | {0} -> {1}, proxy switched at {2} UTC, status {3} |" -f $(if ($deploy.old_slot) { $deploy.old_slot } else { '(none)' }), $deploy.new_slot, $(if ($deploy.switched_utc) { ([DateTime]::Parse($deploy.switched_utc, $null, 'RoundtripKind')).ToString('HH:mm:ss.fff') } else { '-' }), $deploy.status)
}
Add ("| After deployment | {0}/{1} responses served the new commit ``{2}`` |" -f $afterNew, $after.Count, $expected)
Add ("| Actual request interval | avg {0:N2}s, min {1:N2}s, max {2:N2}s (start to start) |" -f $avgInterval, $minInterval, $maxInterval)
Add ("| Largest gap between records | {0:N2}s ({1}) |" -f $maxGap, $maxGapAt)
Add ("| Response time (ok) | avg {0:N0} ms, max {1} ms |" -f $avgMs, $maxMs)
if ($gaps.Count -gt 0) {
  Add ("| Unverified periods (> {0}s without a request) | {1} |" -f $GapLimitSec, ($gaps -join '; '))
} else {
  Add ("| Unverified periods (> {0}s without a request) | none |" -f $GapLimitSec)
}
Add ""
if ($initial) {
  Add "_Initial deployment: there was no running service before this run, so the 'before' requests are expected to fail. Zero-downtime is verified on the next deployment._"
} elseif ($verdict -eq 'SUCCESS') {
  Add ("_Within the observed window every request returned the full page, and no gap exceeded {0}s, so no interruption was observed while the service switched to the new version. Periods outside the window are not verified._" -f $GapLimitSec)
} else {
  Add "_Verification failed: see the failed requests below and the deploy-verification artifact._"
}

$failed = @($rows | Where-Object { -not $_.ok })
if ($failed.Count -gt 0 -and -not $initial) {
  Add ""
  Add "| Failed request | Stage | UTC start | HTTP | Error |"
  Add "|---|---|---|---:|---|"
  foreach ($f in ($failed | Select-Object -First 10)) { Add ("| #{0} | {1} | {2} | {3} | {4} |" -f $f.seq, $f.phase, $f.t0.ToString('HH:mm:ss.fff'), $f.http, $f.error) }
}

$md = $sb.ToString()
[System.IO.File]::WriteAllText((Join-Path $LogDir 'summary.md'), $md, $utf8)
if ($env:GITHUB_STEP_SUMMARY) { [System.IO.File]::AppendAllText($env:GITHUB_STEP_SUMMARY, $md, $utf8) }

# Every request goes to the job log as well.
Write-Host "seq  phase   start(UTC)    ms   http valid version commit  served_by"
foreach ($r in $rows) {
  Write-Host ('{0,-4} {1,-7} {2} {3,5} {4,4} {5,-5} {6,-7} {7,-7} {8} {9}' -f $r.seq, $r.phase, $r.t0.ToString('HH:mm:ss.fff'), $r.ms, $r.http, $r.valid, $r.version, $r.commit, $r.served_by, $r.error)
}
Write-Host ""
Write-Host $md

if ($verdict -eq 'FAILED') { exit 1 }
exit 0
