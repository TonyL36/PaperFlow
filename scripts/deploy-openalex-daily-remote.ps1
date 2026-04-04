param(
  [string]$RemoteHost = "47.109.193.180",
  [string]$User = "root",
  [string]$RepoDir = "/opt/PaperFlow/PaperFlow",
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$DemoToken = "demo-token",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [string]$Cron = "0 2 * * *"
)

$ErrorActionPreference = "Stop"

$remote = @"
set -e
WORKDIR="$RepoDir"
if [ ! -d "`$WORKDIR" ]; then
  CANDIDATES="/opt/PaperFlow/PaperFlow /root/PaperFlow/PaperFlow /home/$User/PaperFlow/PaperFlow /srv/PaperFlow/PaperFlow"
  for d in `$CANDIDATES; do
    if [ -d "`$d" ]; then WORKDIR="`$d"; break; fi
  done
fi
if [ ! -d "`$WORKDIR" ]; then
  HIT=`$(find / -maxdepth 5 -type f -name 'run-openalex-daily.ps1' 2>/dev/null | head -n 1 || true)
  if [ -n "`$HIT" ]; then WORKDIR=`$(dirname `$(dirname "`$HIT")); fi
fi
if [ ! -d "`$WORKDIR" ]; then
  echo "REPO_DIR_NOT_FOUND"
  exit 2
fi
echo "WORKDIR=`$WORKDIR"
cd "`$WORKDIR"
if [ ! -d .git ]; then
  echo "INVALID_REPO_DIR: `.git not found"
  exit 3
fi
git pull
mkdir -p logs scripts/state
PWSH_BIN=`$(command -v pwsh || true)
if [ -z "`$PWSH_BIN" ]; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y wget apt-transport-https software-properties-common gnupg
    . /etc/os-release
    if [ "`$ID" = "ubuntu" ]; then
      wget -q "https://packages.microsoft.com/config/ubuntu/`$VERSION_ID/packages-microsoft-prod.deb" -O /tmp/packages-microsoft-prod.deb
    elif [ "`$ID" = "debian" ]; then
      wget -q "https://packages.microsoft.com/config/debian/`$VERSION_ID/packages-microsoft-prod.deb" -O /tmp/packages-microsoft-prod.deb
    fi
    if [ -f /tmp/packages-microsoft-prod.deb ]; then
      dpkg -i /tmp/packages-microsoft-prod.deb || true
      apt-get update
      apt-get install -y powershell
    fi
  fi
fi
PWSH_BIN=`$(command -v pwsh || true)
if [ -z "`$PWSH_BIN" ]; then
  echo "PWSH_NOT_FOUND"
  exit 4
fi
CRON_LINE='$Cron cd '`$WORKDIR' && '`$PWSH_BIN' -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-openalex-daily.ps1 -BaseUrl "$BaseUrl" -DemoToken "$DemoToken" -Email "$Email" -Password "$Password" -DailyCount 10 -FetchPages 4 >> '`$WORKDIR'/logs/openalex-daily.log 2>&1'
(crontab -l 2>/dev/null | grep -v 'run-openalex-daily.ps1' || true; echo "`$CRON_LINE") | crontab -
"`$PWSH_BIN" -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-openalex-daily.ps1 -BaseUrl "$BaseUrl" -DemoToken "$DemoToken" -Email "$Email" -Password "$Password" -DailyCount 2 -FetchPages 2
echo 'DEPLOY_DONE'
crontab -l | grep 'run-openalex-daily.ps1'
"@

$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, $remote, [System.Text.UTF8Encoding]::new($false))
try {
  Get-Content -Raw -Encoding UTF8 $tmp | ssh -tt "$User@$RemoteHost" "bash -s"
} finally {
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}
