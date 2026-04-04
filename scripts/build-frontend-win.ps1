param(
  [switch]$CleanInstall
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repoRoot "apps/paperflow-web"
$toolsRoot = Join-Path $repoRoot ".tools"
$nodeVersion = "v20.18.0"
$nodeZip = Join-Path $toolsRoot "node-$nodeVersion-win-x64.zip"
$nodeDir = Join-Path $toolsRoot "node-$nodeVersion-win-x64"
$nodeExe = Join-Path $nodeDir "node.exe"

if (!(Test-Path $nodeExe)) {
  New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
  if (!(Test-Path $nodeZip)) {
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile $nodeZip
  }
  Expand-Archive -Path $nodeZip -DestinationPath $toolsRoot -Force
}

$env:Path = "$nodeDir;$env:Path"

Push-Location $webRoot
try {
  taskkill /F /IM node.exe 2>$null | Out-Null
  npm config set registry https://registry.npmmirror.com
  npm config set fetch-timeout 120000
  npm config set audit false
  npm config set fund false
  npm config set prefer-offline true
  if ($CleanInstall) {
    if (Test-Path ".\node_modules") { Remove-Item -Recurse -Force ".\node_modules" }
    if (Test-Path ".\package-lock.json") { Remove-Item -Force ".\package-lock.json" }
    npm install --no-audit --no-fund
  } elseif (!(Test-Path ".\node_modules")) {
    npm install --no-audit --no-fund
  }
  $env:NODE_OPTIONS = "--max-old-space-size=4096"
  npm run build -- --logLevel info
  if (!(Test-Path ".\dist\index.html")) {
    throw "frontend dist not generated"
  }
  Get-Item ".\dist\index.html" | Select-Object FullName, Length, LastWriteTime
} finally {
  Pop-Location
}
