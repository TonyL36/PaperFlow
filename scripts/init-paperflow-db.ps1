param(
  [string]$ComposeFile = "docker/compose.dev.yml"
)

$ErrorActionPreference = "Stop"

Write-Host "Applying PaperFlow knowledge database schema using $ComposeFile ..."
docker compose -f $ComposeFile exec -T postgres psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/02-paperflowdb.sql
Write-Host "PaperFlow knowledge database schema applied."
