param(
  [Alias("Host")]
  [string]$RemoteHost = "47.109.193.180",
  [Alias("User")]
  [string]$RemoteUser = "root",
  [string]$RemoteBase = "/opt",
  [string]$RemotePackageName = "paperflow-deploy-with-jars.tar.gz",
  [switch]$SkipLocalBuild
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $repoRoot
$repoName = Split-Path -Leaf $repoRoot
$mvnCmd = Join-Path $repoRoot ".tools/apache-maven-3.9.9/bin/mvn.cmd"
if (!(Test-Path $mvnCmd)) {
  $mvnCmd = "mvn"
}
$npmCmd = "npm.cmd"
if (!(Get-Command $npmCmd -ErrorAction SilentlyContinue)) {
  $npmCmd = "npm"
}

function Test-BackendArtifacts([string]$root) {
  $paths = @(
    (Join-Path $root "backend/services/user-service/target/user-service-0.1.0-SNAPSHOT.jar"),
    (Join-Path $root "backend/services/content-service/target/content-service-0.1.0-SNAPSHOT.jar"),
    (Join-Path $root "backend/services/api-gateway/target/api-gateway-0.1.0-SNAPSHOT.jar")
  )
  return ($paths | Where-Object { !(Test-Path $_) }).Count -eq 0
}

function Test-FrontendArtifacts([string]$root) {
  return (Test-Path (Join-Path $root "apps/paperflow-web/dist/index.html"))
}

function Test-ComposeProdDockerfileMap([string]$root) {
  $composePath = Join-Path $root "docker/compose.prod.yml"
  if (!(Test-Path $composePath)) {
    Write-Warning "compose not found: $composePath"
    return $false
  }
  $text = Get-Content $composePath -Raw -Encoding UTF8
  $expectedMappings = @(
    @{ Service = "user-service"; Dockerfile = "docker/Dockerfile.user-service" },
    @{ Service = "content-service"; Dockerfile = "docker/Dockerfile.content-service" },
    @{ Service = "api-gateway"; Dockerfile = "docker/Dockerfile.api-gateway" },
    @{ Service = "frontend"; Dockerfile = "docker/Dockerfile.frontend" }
  )
  foreach ($mapping in $expectedMappings) {
    $servicePattern = "(?ms)^\s{2}$([regex]::Escape($mapping.Service)):\s.*?^\s{4}dockerfile:\s$([regex]::Escape($mapping.Dockerfile))\s*$"
    if ($text -notmatch $servicePattern) {
      Write-Warning "compose.prod.yml dockerfile mismatch for $($mapping.Service), expected $($mapping.Dockerfile)"
      return $false
    }
  }
  return $true
}

if (-not (Test-ComposeProdDockerfileMap $repoRoot)) { throw "compose.prod.yml dockerfile mapping check failed" }

Push-Location $repoRoot
try {
  if (-not $SkipLocalBuild) {
    & $mvnCmd -DskipTests -pl backend/services/user-service,backend/services/content-service,backend/services/api-gateway -am package
    if ($LASTEXITCODE -ne 0) {
      if (-not (Test-BackendArtifacts $repoRoot)) { throw "maven build failed" }
      Write-Warning "maven build failed, fallback to existing backend jars."
    }
    Push-Location (Join-Path $repoRoot "apps/paperflow-web")
    try {
      & $npmCmd ci
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "frontend npm ci failed, fallback to npm install."
        & $npmCmd install
      }
      if ($LASTEXITCODE -eq 0) {
        & $npmCmd run build
      }
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "frontend build failed locally, keep current frontend container content."
      }
    } finally {
      Pop-Location
    }
  } else {
    if (-not (Test-BackendArtifacts $repoRoot)) { throw "missing backend jars while SkipLocalBuild is set" }
  }
} finally {
  Pop-Location
}

$packagePath = Join-Path $workspaceRoot $RemotePackageName
if (Test-Path $packagePath) {
  Remove-Item $packagePath -Force
}

& tar -czf $packagePath --exclude=.git --exclude=.dev --exclude=node_modules --exclude=apps/paperflow-web/node_modules -C $workspaceRoot $repoName
if ($LASTEXITCODE -ne 0) { throw "package failed" }

& scp $packagePath "$RemoteUser@$RemoteHost`:$RemoteBase/"
if ($LASTEXITCODE -ne 0) { throw "upload failed" }

$remoteScript = @"
set -e
export DOCKER_BUILDKIT=0
export COMPOSE_BAKE=false
export COMPOSE_PARALLEL_LIMIT=1
cd $RemoteBase
rm -rf $RemoteBase/$repoName
mkdir -p $RemoteBase/$repoName
tar -xzf $RemoteBase/$RemotePackageName -C $RemoteBase
cd $RemoteBase/$repoName
chmod +x scripts/deploy.sh scripts/*.sh
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml up -d --no-build
USER_CID=`$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q user-service)
CONTENT_CID=`$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q content-service)
GATEWAY_CID=`$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q api-gateway)
FRONTEND_CID=`$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q frontend)
test -n "`$USER_CID" -a -n "`$CONTENT_CID" -a -n "`$GATEWAY_CID" -a -n "`$FRONTEND_CID"
docker cp backend/services/user-service/target/user-service-0.1.0-SNAPSHOT.jar "`$USER_CID":/app/app.jar
docker cp backend/services/content-service/target/content-service-0.1.0-SNAPSHOT.jar "`$CONTENT_CID":/app/app.jar
docker cp backend/services/api-gateway/target/api-gateway-0.1.0-SNAPSHOT.jar "`$GATEWAY_CID":/app/app.jar
if [ -f apps/paperflow-web/dist/index.html ]; then
  docker cp apps/paperflow-web/dist/. "`$FRONTEND_CID":/usr/share/nginx/html/
else
  echo "skip frontend copy: dist not found"
fi
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml restart user-service content-service api-gateway frontend
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps
"@

if ($remoteScript.StartsWith("`r`n")) {
  $remoteScript = $remoteScript.Substring(2)
}
$localRemoteScriptPath = Join-Path $env:TEMP "paperflow-remote-deploy.sh"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($localRemoteScriptPath, $remoteScript, $utf8NoBom)

$remoteScriptPath = "/tmp/paperflow-remote-deploy.sh"
& scp $localRemoteScriptPath "$RemoteUser@$RemoteHost`:$remoteScriptPath"
if ($LASTEXITCODE -ne 0) { throw "upload remote script failed" }

& ssh "$RemoteUser@$RemoteHost" "bash $remoteScriptPath"
if ($LASTEXITCODE -ne 0) { throw "remote deploy failed" }

Write-Host "Deploy completed."
