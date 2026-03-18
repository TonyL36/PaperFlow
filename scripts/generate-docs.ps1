param(
  [Parameter(Mandatory = $false)]
  [string]$MavenArgs = "-DskipTests"
)

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  mvn $MavenArgs verify
} finally {
  Pop-Location
}

