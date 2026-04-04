param(
  [string]$RemoteHost = "47.109.193.180",
  [string]$User = "root",
  [string]$RepoDir = "/opt/paperflow",
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [string]$Cron = "0 2 * * *",
  [int]$DailyCount = 10,
  [string]$Model = "glm-4-flash"
)

$ErrorActionPreference = "Stop"

$remote = @"
set -e
WORKDIR="$RepoDir"
if [ ! -d "`$WORKDIR" ]; then
  echo "REPO_DIR_NOT_FOUND"
  exit 2
fi
cd "`$WORKDIR"
if [ ! -f ./scripts/run-medical-daily.ps1 ]; then
  echo "SCRIPT_NOT_FOUND: ./scripts/run-medical-daily.ps1"
  exit 3
fi
if [ -d .git ]; then
  git pull
else
  echo "NO_GIT_REPO_SKIP_PULL"
fi
mkdir -p logs scripts/state
PWSH_BIN=`$(command -v pwsh || true)
if [ -z "`$PWSH_BIN" ]; then
  echo "PWSH_NOT_FOUND"
  exit 4
fi
CRON_LINE='$Cron cd '`$WORKDIR' && '`$PWSH_BIN' -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-medical-daily.ps1 -BaseUrl "$BaseUrl" -Email "$Email" -Password "$Password" -DailyCount $DailyCount -Model "$Model" -StatePath '`$WORKDIR'/scripts/state/medical-ingest-state.json -LockFile '`$WORKDIR'/scripts/state/medical-daily.lock >> '`$WORKDIR'/logs/medical-daily.log 2>&1'
(crontab -l 2>/dev/null | grep -v 'run-medical-daily.ps1' || true; echo "`$CRON_LINE") | crontab -
"`$PWSH_BIN" -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-medical-daily.ps1 -BaseUrl "$BaseUrl" -Email "$Email" -Password "$Password" -DailyCount 2 -Model "$Model" -StatePath "`$WORKDIR/scripts/state/medical-ingest-state.json" -LockFile "`$WORKDIR/scripts/state/medical-daily.lock"
echo "DEPLOY_DONE"
crontab -l | grep 'run-medical-daily.ps1'
"@

$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, $remote, [System.Text.UTF8Encoding]::new($false))
try {
  Get-Content -Raw -Encoding UTF8 $tmp | ssh -tt "$User@$RemoteHost" "bash -s"
} finally {
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}
