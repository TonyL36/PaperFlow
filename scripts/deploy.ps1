param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("dev", "test", "prod")]
  [string]$Env = "dev"
)

$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root ("docker/compose.{0}.yml" -f $Env)
$envFile = Join-Path $root ("docker/env/{0}.env" -f $Env)

if (!(Test-Path $compose)) { throw "compose not found: $compose" }
if (!(Test-Path $envFile)) { throw "env file not found: $envFile" }

Push-Location $root
try {
  docker compose --env-file $envFile -f $compose up -d --build
} finally {
  Pop-Location
}

