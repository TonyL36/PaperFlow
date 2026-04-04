param(
  [Parameter(Mandatory = $false)]
  [int]$GatewayPort = 3151,
  [Parameter(Mandatory = $false)]
  [int]$SpaPort = 9628,
  [Parameter(Mandatory = $false)]
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

function Wait-HttpOk([string]$url, [int]$timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 3
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        return $true
      }
    } catch {
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

$gatewayHealthUrls = @(
  "http://localhost:$GatewayPort/actuator/health",
  "http://127.0.0.1:$GatewayPort/actuator/health"
)
$gatewayDataUrls = @(
  "http://localhost:$GatewayPort/api/v1/posts?page[number]=1&page[size]=1",
  "http://127.0.0.1:$GatewayPort/api/v1/posts?page[number]=1&page[size]=1"
)
$spaUrls = @(
  "http://localhost:$SpaPort/paperflow/",
  "http://127.0.0.1:$SpaPort/paperflow/"
)
$spaEntryUrls = @(
  "http://localhost:$SpaPort/paperflow/src/main.tsx",
  "http://127.0.0.1:$SpaPort/paperflow/src/main.tsx"
)
$spaRouteUrls = @(
  "http://localhost:$SpaPort/paperflow/posts",
  "http://127.0.0.1:$SpaPort/paperflow/posts"
)

$ok1 = $false
foreach ($url in $gatewayHealthUrls) {
  if (Wait-HttpOk $url $TimeoutSeconds) {
    $ok1 = $true
    break
  }
}
if (!$ok1) { exit 2 }

$ok2 = $false
foreach ($url in $gatewayDataUrls) {
  if (Wait-HttpOk $url $TimeoutSeconds) {
    $ok2 = $true
    break
  }
}
if (!$ok2) { exit 3 }

$ok3 = $false
foreach ($url in $spaUrls) {
  if (Wait-HttpOk $url $TimeoutSeconds) {
    $ok3 = $true
    break
  }
}
if (!$ok3) { exit 4 }

$ok4 = $false
foreach ($url in $spaEntryUrls) {
  if (Wait-HttpOk $url $TimeoutSeconds) {
    $ok4 = $true
    break
  }
}
if (!$ok4) { exit 5 }

$ok5 = $false
foreach ($url in $spaRouteUrls) {
  if (Wait-HttpOk $url $TimeoutSeconds) {
    $ok5 = $true
    break
  }
}
if (!$ok5) { exit 6 }

exit 0
