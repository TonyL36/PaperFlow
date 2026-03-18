param(
  [Parameter(Mandatory = $false)]
  [string]$SpaDir = "apps/paperflow-web"
)

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root $SpaDir
if (!(Test-Path $dir)) { throw "spa dir not found: $dir" }

Push-Location $dir
try {
  if (!(Test-Path "node_modules")) {
    npm i
  }
  npm run dev
} finally {
  Pop-Location
}
