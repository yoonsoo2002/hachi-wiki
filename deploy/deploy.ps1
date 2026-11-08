# Zero-downtime (blue-green) deployment on the local Windows machine (Windows PowerShell 5.1).
#
#   browser --> 127.0.0.1:8080 --> hachi-proxy (nginx) --> hachi-blue  or  hachi-green
#
# 1. Start the new image in the idle slot (blue <-> green) next to the running one.
# 2. Wait until Docker reports it healthy and it serves the expected commit.
# 3. Point nginx at the new slot and reload gracefully (in-flight requests finish).
# 4. Stop the old slot. If anything fails before step 3, the old slot keeps serving.
param(
  [Parameter(Mandatory = $true)][string]$Image,
  [string]$ExpectedCommit = '',
  [Parameter(Mandatory = $true)][string]$LogDir,
  [int]$Port = 8080,
  [string]$Network = 'hachi-net',
  [string]$Proxy = 'hachi-proxy',
  [string]$ProxyImage = 'nginx:1.31.7-alpine'
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding $false
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }

function Log([string]$msg) { Write-Host ("[{0}] {1}" -f [DateTime]::UtcNow.ToString('HH:mm:ss'), $msg) }

function RunDocker {
  # Runs docker, echoes output, and fails the deployment on a non-zero exit code.
  $out = & docker @args
  $code = $LASTEXITCODE
  if ($out) { $out | ForEach-Object { Write-Host "  $_" } }
  if ($code -ne 0) { throw "docker $($args -join ' ') failed with exit code $code" }
  return $out
}

function Exists([string]$name) {
  $found = & docker ps -a --filter "name=^$name$" --format '{{.Names}}'
  return ($found -eq $name)
}

function IsRunning([string]$name) {
  $state = & docker inspect -f '{{.State.Running}}' $name 2>$null
  return ($LASTEXITCODE -eq 0 -and $state -eq 'true')
}

function ActiveSlot {
  if (-not (IsRunning $Proxy)) { return '' }
  $conf = & docker exec $Proxy cat /etc/nginx/conf.d/default.conf 2>$null
  $m = [regex]::Match(($conf -join "`n"), 'server (hachi-(blue|green)):3000')
  if ($m.Success -and (IsRunning $m.Groups[1].Value)) { return $m.Groups[1].Value }
  return ''
}

function WriteProxyConfig([string]$slot) {
  $template = @'
upstream hachi_app {
    server __SLOT__:3000;
    keepalive 8;
}
server {
    listen 80;
    location / {
        proxy_pass http://hachi_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        add_header X-Active-Slot __SLOT__ always;
    }
}
'@
  $conf = ($template -replace '__SLOT__', $slot) -replace "`r`n", "`n"
  $tmp = Join-Path $LogDir 'nginx-default.conf'
  [System.IO.File]::WriteAllText($tmp, $conf, $utf8)
  RunDocker cp $tmp "${Proxy}:/etc/nginx/conf.d/default.conf" | Out-Null
  RunDocker exec $Proxy nginx -t | Out-Null
  RunDocker exec $Proxy nginx -s reload | Out-Null
}

function ServedCommit {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3 -Headers @{ 'Cache-Control' = 'no-cache' }
    return ($r.Content | ConvertFrom-Json).commit
  } catch { return '' }
}

$result = [ordered]@{
  image = ($Image -replace '^[^/]+/', '<dockerhub-user>/')
  expected_commit = $ExpectedCommit
  started_utc = [DateTime]::UtcNow.ToString('o')
  old_slot = ''
  new_slot = ''
  switched_utc = ''
  finished_utc = ''
  initial_deploy = $false
  status = 'failed'
}

try {
  # Network shared by the proxy and both app slots (containers find each other by name).
  & docker network inspect $Network *> $null
  if ($LASTEXITCODE -ne 0) { Log "Creating network $Network"; RunDocker network create $Network | Out-Null }

  $old = ActiveSlot
  if ($old -eq 'hachi-blue') { $new = 'hachi-green' } else { $new = 'hachi-blue' }
  $result.old_slot = $old
  $result.new_slot = $new
  $result.initial_deploy = ($old -eq '')
  if ($old) { Log "Active slot: $old -> deploying to $new" } else { Log "No running slot. Initial deployment to $new" }

  if (Exists $new) { Log "Removing leftover $new"; RunDocker rm -f $new | Out-Null }

  Log "Starting $new from $Image"
  # --hostname: 응답 헤더 X-Served-By에 hachi-blue / hachi-green이 찍혀 어느 슬롯이 응답했는지 보인다.
  RunDocker run -d --name $new --hostname $new --network $Network --restart unless-stopped --label hachi.role=app $Image | Out-Null

  # Wait for Docker HEALTHCHECK (Dockerfile) to report healthy.
  $deadline = (Get-Date).AddSeconds(90)
  $health = ''
  while ((Get-Date) -lt $deadline) {
    $health = & docker inspect -f '{{.State.Health.Status}}' $new
    if ($health -eq 'healthy' -or $health -eq 'unhealthy') { break }
    Start-Sleep -Seconds 2
  }
  if ($health -ne 'healthy') {
    & docker logs --tail 50 $new
    & docker rm -f $new | Out-Null
    throw "New container $new did not become healthy (status: $health). The old slot keeps serving."
  }
  Log "$new is healthy"

  # Check the new container really runs the commit we just built.
  $h = (RunDocker exec $new wget -qO- http://127.0.0.1:3000/api/health) -join ''
  $info = $h | ConvertFrom-Json
  Log "$new serves version $($info.version), commit $($info.commit)"
  if ($ExpectedCommit -and $info.commit -ne $ExpectedCommit) {
    & docker rm -f $new | Out-Null
    throw "New container serves commit $($info.commit), expected $ExpectedCommit"
  }

  # Proxy: create it once, then only switch its upstream.
  if (-not (Exists $Proxy)) {
    Log "Creating proxy $Proxy on 127.0.0.1:$Port"
    RunDocker run -d --name $Proxy --network $Network --restart unless-stopped -p "127.0.0.1:${Port}:80" $ProxyImage | Out-Null
    Start-Sleep -Seconds 2
  } elseif (-not (IsRunning $Proxy)) {
    RunDocker start $Proxy | Out-Null
    Start-Sleep -Seconds 2
  }
  Log "Switching proxy to $new (graceful nginx reload)"
  WriteProxyConfig $new
  $result.switched_utc = [DateTime]::UtcNow.ToString('o')

  # Confirm through the public address.
  $deadline = (Get-Date).AddSeconds(20)
  $served = ''
  while ((Get-Date) -lt $deadline) {
    $served = ServedCommit
    if (-not $ExpectedCommit -or $served -eq $ExpectedCommit) { break }
    Start-Sleep -Milliseconds 500
  }
  if ($ExpectedCommit -and $served -ne $ExpectedCommit) { throw "Proxy still serves commit '$served', expected $ExpectedCommit" }
  Log "http://127.0.0.1:$Port serves commit $served"

  # Let in-flight requests to the old slot finish, then stop it (SIGTERM, graceful).
  if ($old) {
    Start-Sleep -Seconds 3
    Log "Stopping old slot $old"
    RunDocker stop -t 15 $old | Out-Null
    RunDocker rm $old | Out-Null
  }

  & docker image prune -f --filter 'dangling=true' | Out-Null
  & docker ps --filter 'name=^hachi-' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  $result.status = 'success'
} catch {
  Write-Host "::error::$($_.Exception.Message)"
  $result.error = $_.Exception.Message
} finally {
  $result.finished_utc = [DateTime]::UtcNow.ToString('o')
  [System.IO.File]::WriteAllText((Join-Path $LogDir 'deploy-result.json'), ($result | ConvertTo-Json), $utf8)
}

if ($result.status -ne 'success') { exit 1 }
exit 0
