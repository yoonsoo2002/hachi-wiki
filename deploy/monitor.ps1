# Availability monitor for zero-downtime verification (Windows PowerShell 5.1).
# Runs as a separate process during the Deploy workflow.
# Sends one real request to the service, waits for the response, records it,
# sleeps IntervalSec, and repeats until <LogDir>\stop.flag appears.
# The current phase (before / during / after) is read from <LogDir>\phase.txt.
param(
  [string]$Url = 'http://127.0.0.1:8080/',
  [Parameter(Mandatory = $true)][string]$LogDir,
  [double]$IntervalSec = 1,
  [int]$TimeoutSec = 5,
  # The service response is valid only when the page body contains this marker.
  [string]$Marker = 'id="layout"'
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$utf8 = New-Object System.Text.UTF8Encoding $false
$csv = Join-Path $LogDir 'requests.csv'
$phaseFile = Join-Path $LogDir 'phase.txt'
$stopFile = Join-Path $LogDir 'stop.flag'

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }
[System.IO.File]::WriteAllText($csv, "seq,phase,start_utc,end_utc,ms,http,valid,version,commit,served_by,error`n", $utf8)

function Clean([string]$s) {
  if ($null -eq $s) { return '' }
  return ($s -replace '[,\r\n"]', ' ').Trim()
}

function HeaderValue($headers, [string]$name) {
  if ($null -eq $headers) { return '' }
  $v = $headers[$name]
  if ($null -eq $v) { return '' }
  return (Clean ([string]($v -join ',')))
}

$seq = 0
while (-not (Test-Path $stopFile)) {
  $phase = 'unknown'
  if (Test-Path $phaseFile) { $phase = Clean ((Get-Content $phaseFile -Raw)) }

  $seq++
  $start = [DateTime]::UtcNow
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $http = 0; $valid = $false; $version = ''; $commit = ''; $servedBy = ''; $err = ''
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -Headers @{ 'Cache-Control' = 'no-cache' }
    $http = [int]$r.StatusCode
    $valid = ($http -eq 200) -and ($r.Content -like "*$Marker*")
    $version = HeaderValue $r.Headers 'X-App-Version'
    $commit = HeaderValue $r.Headers 'X-App-Commit'
    $servedBy = HeaderValue $r.Headers 'X-Served-By'
    if (-not $valid) { $err = 'response did not contain the expected page' }
  } catch {
    $resp = $_.Exception.Response
    if ($null -ne $resp) {
      try { $http = [int]$resp.StatusCode } catch { $http = 0 }
      try { $version = HeaderValue $resp.Headers 'X-App-Version'; $commit = HeaderValue $resp.Headers 'X-App-Commit' } catch { }
    }
    $err = Clean $_.Exception.Message
  }
  $sw.Stop()
  $end = [DateTime]::UtcNow

  $line = '{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10}' -f $seq, $phase, $start.ToString('o'), $end.ToString('o'),
    [int]$sw.Elapsed.TotalMilliseconds, $http, $valid.ToString().ToLower(), $version, $commit, $servedBy, $err
  [System.IO.File]::AppendAllText($csv, $line + "`n", $utf8)

  Start-Sleep -Milliseconds ([int]($IntervalSec * 1000))
}
exit 0
