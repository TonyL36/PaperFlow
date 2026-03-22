param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("up", "down", "status")]
  [string]$Action = "up",
  [Parameter(Mandatory = $false)]
  [switch]$SkipBuild,
  [Parameter(Mandatory = $false)]
  [switch]$Force,
  [Parameter(Mandatory = $false)]
  [string]$DemoIngestToken = "demo-token",
  [Parameter(Mandatory = $false)]
  [int]$GatewayPort = 3151,
  [Parameter(Mandatory = $false)]
  [int]$UserServicePort = 8081,
  [Parameter(Mandatory = $false)]
  [int]$ContentServicePort = 8082,
  [Parameter(Mandatory = $false)]
  [int]$SpaPort = 9628
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root ".dev"
$logDir = Join-Path $stateDir "logs"
$pidFile = Join-Path $stateDir "pids.json"

function Ensure-Dirs {
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

function Is-PortOpen([int]$port) {
  try {
    return (Test-NetConnection -ComputerName "localhost" -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Save-Pids($pids) {
  $pids | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -Path $pidFile
}

function Load-Pids {
  if (!(Test-Path $pidFile)) { return $null }
  return (Get-Content -Raw -Path $pidFile | ConvertFrom-Json)
}

function Stop-ByPid($procId) {
  if ($procId -eq $null) { return }
  try {
    & taskkill.exe /PID ([int]$procId) /T /F 2>$null | Out-Null
  } catch {
  }
}

function Get-ListeningPidByPort([int]$port) {
  $lines = & netstat -ano -p tcp | Select-String -Pattern (":$port\s+.*LISTENING\s+(\d+)\s*$") -AllMatches
  foreach ($m in $lines.Matches) {
    if ($m.Groups.Count -ge 2) {
      $listenPidValue = $m.Groups[1].Value
      if ($listenPidValue) { return [int]$listenPidValue }
    }
  }
  return $null
}

function Stop-ByPort([int]$port) {
  $listenPid = Get-ListeningPidByPort $port
  if ($listenPid -ne $null) {
    Stop-ByPid $listenPid
  }
}

function Stop-Stack($pids, [int]$GatewayPort, [int]$UserServicePort, [int]$ContentServicePort, [int]$SpaPort) {
  if ($pids) {
    Stop-ByPid $pids.spa
    Stop-ByPid $pids.gateway
    Stop-ByPid $pids.userService
    Stop-ByPid $pids.contentService
  }
  Stop-ByPort $SpaPort
  Stop-ByPort $GatewayPort
  Stop-ByPort $UserServicePort
  Stop-ByPort $ContentServicePort
}

function Wait-Http([string]$url, [int]$timeoutSeconds = 20) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $code = 0
      $req = [System.Net.HttpWebRequest]::Create($url)
      $req.Method = "GET"
      $req.Timeout = 2000
      try {
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
      } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
          $code = [int]$_.Exception.Response.StatusCode
          $_.Exception.Response.Close()
        }
      }
      if ($code -ge 200 -and $code -lt 500) { return $true }
    } catch {
    }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Get-LatestJar([string]$dir, [string]$prefix) {
  $files = Get-ChildItem -Path $dir -Filter "$prefix-*.jar" -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notlike "*.jar.original" } |
      Sort-Object LastWriteTimeUtc -Descending
  if (!$files -or $files.Count -eq 0) {
    return $null
  }
  return $files[0].FullName
}

Ensure-Dirs

if ($Action -eq "status") {
  $pids = Load-Pids
  $ports = [ordered]@{
    gateway = $GatewayPort
    userService = $UserServicePort
    contentService = $ContentServicePort
    spa = $SpaPort
  }
  $ports.GetEnumerator() | ForEach-Object {
    $open = Is-PortOpen $_.Value
    Write-Host ("{0,-14} port={1} open={2}" -f $_.Key, $_.Value, $open)
  }
  if ($pids) {
    Write-Host ("pids file: {0}" -f $pidFile)
  } else {
    Write-Host ("pids file: (none)")
  }
  exit 0
}

if ($Action -eq "down") {
  $pids = Load-Pids
  Stop-Stack $pids $GatewayPort $UserServicePort $ContentServicePort $SpaPort
  Remove-Item -Force -ErrorAction SilentlyContinue $pidFile | Out-Null
  Write-Host "down ok"
  exit 0
}

$portsToCheck = @($GatewayPort, $UserServicePort, $ContentServicePort, $SpaPort)
$anyPortInUse = $false
foreach ($p in $portsToCheck) {
  if (Is-PortOpen $p) {
    $anyPortInUse = $true
    break
  }
}

if ($Action -eq "up" -and $anyPortInUse) {
  $pids = Load-Pids
  if ($pids) {
    Stop-ByPid $pids.spa
    Stop-ByPid $pids.gateway
    Stop-ByPid $pids.userService
    Stop-ByPid $pids.contentService
    Remove-Item -Force -ErrorAction SilentlyContinue $pidFile | Out-Null
    Start-Sleep -Milliseconds 600
  } elseif ($Force) {
    Stop-ByPort $SpaPort
    Stop-ByPort $GatewayPort
    Stop-ByPort $UserServicePort
    Stop-ByPort $ContentServicePort
    Start-Sleep -Milliseconds 600
  } else {
    $inUse = $portsToCheck | Where-Object { Is-PortOpen $_ }
    throw ("port in use: {0}. Run .\\scripts\\dev.ps1 down, or re-run with -Force." -f (($inUse | Sort-Object) -join ","))
  }
}

if (!$SkipBuild) {
  try {
    & (Join-Path $PSScriptRoot "bootstrap-maven.ps1") -Cmd package -Args @(
      "-DskipTests",
      "-pl",
      "backend/services/api-gateway,backend/services/user-service,backend/services/content-service",
      "-am"
    )
  } catch {
    throw ("build failed. If you see 'Unable to rename ... .jar.original', it usually means a java process is holding the jar. Run .\\scripts\\dev.ps1 down (or -Force) and retry. Original error: {0}" -f $_.Exception.Message)
  }
}

$gatewayJar = Get-LatestJar (Join-Path $root "backend/services/api-gateway/target") "api-gateway"
$userJar = Get-LatestJar (Join-Path $root "backend/services/user-service/target") "user-service"
$contentJar = Get-LatestJar (Join-Path $root "backend/services/content-service/target") "content-service"
$spaDir = Join-Path $root "apps/paperflow-web"
$npmCmd = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
if (!$npmCmd) { $npmCmd = "npm.cmd" }

if (!(Test-Path $gatewayJar)) { throw "gateway jar not found: $gatewayJar" }
if (!(Test-Path $userJar)) { throw "user-service jar not found: $userJar" }
if (!(Test-Path $contentJar)) { throw "content-service jar not found: $contentJar" }
if (!(Test-Path $spaDir)) { throw "spa dir not found: $spaDir" }

if (Is-PortOpen $GatewayPort) { throw "port in use: $GatewayPort" }
if (Is-PortOpen $UserServicePort) { throw "port in use: $UserServicePort" }
if (Is-PortOpen $ContentServicePort) { throw "port in use: $ContentServicePort" }

$ts = (Get-Date).ToString("yyyyMMdd-HHmmss")
$pids = [ordered]@{}
try {
  $p1 = Start-Process -FilePath "java" -ArgumentList @(
      "-jar", $contentJar,
      "--server.port=$ContentServicePort",
      "--paperflow.demo-ingest.enabled=true",
      "--paperflow.demo-ingest.token=$DemoIngestToken"
    ) -WorkingDirectory $root -RedirectStandardOutput (Join-Path $logDir "content-service-$ts.log") -RedirectStandardError (Join-Path $logDir "content-service-$ts.err.log") -WindowStyle Hidden -PassThru
  $pids.contentService = $p1.Id

  $p2 = Start-Process -FilePath "java" -ArgumentList @(
      "-jar", $userJar,
      "--server.port=$UserServicePort"
    ) -WorkingDirectory $root -RedirectStandardOutput (Join-Path $logDir "user-service-$ts.log") -RedirectStandardError (Join-Path $logDir "user-service-$ts.err.log") -WindowStyle Hidden -PassThru
  $pids.userService = $p2.Id

  $prevUserUrl = $env:USER_SERVICE_URL
  $prevContentUrl = $env:CONTENT_SERVICE_URL
  $env:USER_SERVICE_URL = "http://localhost:$UserServicePort"
  $env:CONTENT_SERVICE_URL = "http://localhost:$ContentServicePort"
  $p3 = Start-Process -FilePath "java" -ArgumentList @(
      "-jar", $gatewayJar,
      "--server.port=$GatewayPort"
    ) -WorkingDirectory $root -RedirectStandardOutput (Join-Path $logDir "api-gateway-$ts.log") -RedirectStandardError (Join-Path $logDir "api-gateway-$ts.err.log") -WindowStyle Hidden -PassThru
  $pids.gateway = $p3.Id
  $env:USER_SERVICE_URL = $prevUserUrl
  $env:CONTENT_SERVICE_URL = $prevContentUrl

  Push-Location $spaDir
  try {
    $prevViteApi = $env:VITE_API_BASE
    $env:VITE_API_BASE = "http://localhost:$GatewayPort"
    if (!(Test-Path "node_modules")) {
      & $npmCmd "i" | Out-Null
    }
  } finally {
    $env:VITE_API_BASE = $prevViteApi
    Pop-Location
  }

  $prevViteApi = $env:VITE_API_BASE
  $env:VITE_API_BASE = "http://localhost:$GatewayPort"
  $p4 = Start-Process -FilePath $npmCmd -ArgumentList @("run", "dev", "--", "--port", "$SpaPort") -WorkingDirectory $spaDir -RedirectStandardOutput (Join-Path $logDir "spa-$ts.log") -RedirectStandardError (Join-Path $logDir "spa-$ts.err.log") -WindowStyle Hidden -PassThru
  $env:VITE_API_BASE = $prevViteApi
  $pids.spa = $p4.Id

  if (!(Wait-Http "http://localhost:$ContentServicePort/api/v1/actuator/health" 35)) { throw "content-service not ready" }
  if (!(Wait-Http "http://localhost:$UserServicePort/api/v1/actuator/health" 35)) { throw "user-service not ready" }
  if (!(Wait-Http "http://localhost:$GatewayPort/actuator/health" 35)) { throw "api-gateway not ready" }
  if (!(Wait-Http "http://localhost:$GatewayPort/api/v1/posts?page[number]=1&page[size]=1" 35)) { throw "gateway upstream route not ready" }

  Save-Pids $pids
  Write-Host ("gateway: http://localhost:{0}" -f $GatewayPort)
  Write-Host ("spa:     http://localhost:{0}/paperflow/" -f $SpaPort)
  Write-Host ("token:   {0}" -f $DemoIngestToken)
} catch {
  Stop-Stack $pids $GatewayPort $UserServicePort $ContentServicePort $SpaPort
  Remove-Item -Force -ErrorAction SilentlyContinue $pidFile | Out-Null
  throw ("startup failed: {0}. check logs under .dev/logs with timestamp {1}" -f $_.Exception.Message, $ts)
}
