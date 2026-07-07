param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [ValidateSet("medical","cybersecurity","bigdata")]
  [string]$Topic = "cybersecurity",
  [int]$DailyCount = 10,
  [string]$Model = "glm-4-flash",
  [string]$StatePath = "",
  [string]$LockFile = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $root
if ([string]::IsNullOrWhiteSpace($StatePath)) { $StatePath = Join-Path $root ("state\" + $Topic + "-ingest-state.json") }
if ([string]::IsNullOrWhiteSpace($LockFile)) { $LockFile = Join-Path $root ("state\" + $Topic + "-daily.lock") }
$lockTtlMinutes = 90

switch ($Topic) {
  "medical" { $source = "agent-medical-review" }
  "cybersecurity" { $source = "agent-cybersecurity-review" }
  "bigdata" { $source = "agent-bigdata-review" }
}

function GetTopicStats([string]$baseUrl, [string]$sourceName) {
  $all = @()
  for ($p = 1; $p -le 60; $p++) {
    $url = "$baseUrl/api/v1/posts?page[number]=$p&page[size]=200"
    $resp = Invoke-RestMethod -Method GET -Uri $url -TimeoutSec 25
    $items = @($resp.data.items)
    if ($items.Count -eq 0) { break }
    $all += $items
    if ($items.Count -lt 200) { break }
  }
  $rows = @(
    $all |
      Where-Object { $_.source -eq $sourceName } |
      Group-Object postId |
      ForEach-Object { $_.Group | Select-Object -First 1 }
  )
  $dup = @($rows | Group-Object title | Where-Object { $_.Count -gt 1 })
  return [pscustomobject]@{ count = $rows.Count; dup = $dup.Count }
}

function IsTopicJobRunning([string]$topicName) {
  if ($IsLinux -or $IsMacOS) {
    try {
      $cmd = "pgrep -af ""run-topic-daily\.ps1.*-Topic\s+$topicName(\s|$)"" | grep -v grep || true"
      $rows = @(& /bin/bash -lc $cmd)
      foreach ($row in $rows) {
        $line = [string]$row
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split "\s+", 2
        if ($parts.Count -lt 1) { continue }
        $pidFound = 0
        if (-not [int]::TryParse($parts[0], [ref]$pidFound)) { continue }
        if ($pidFound -ne $PID) { return $true }
      }
      return $false
    } catch {
      return $false
    }
  }
  return $false
}

$stateDir = Split-Path -Parent $LockFile
if (!(Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
if (Test-Path $LockFile) {
  $running = IsTopicJobRunning -topicName $Topic
  if (-not $running) {
    Remove-Item -Force $LockFile
    Write-Host ("WARN stale lock removed topic={0} reason=no-running-process" -f $Topic)
  }
}
if (Test-Path $LockFile) {
  $lockAgeMinutes = ((Get-Date) - (Get-Item $LockFile).LastWriteTime).TotalMinutes
  if ($lockAgeMinutes -gt $lockTtlMinutes) {
    Remove-Item -Force $LockFile
    Write-Host ("WARN stale lock removed topic={0} age_minutes={1:n1}" -f $Topic, $lockAgeMinutes)
  } else {
    throw "$Topic daily job already running"
  }
}
[System.IO.File]::WriteAllText($LockFile, ((Get-Date).ToString("s")), [System.Text.UTF8Encoding]::new($true))

try {
  $jobStartedAt = Get-Date
  $outDir = Join-Path $projectRoot "paperflow\scripts\out"
  if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  $start = GetTopicStats -baseUrl $BaseUrl -sourceName $source
  Write-Host ("START topic={0} count={1} dup={2}" -f $Topic, $start.count, $start.dup)
  if ($start.dup -gt 0) { throw "duplicate titles exist online, please clean duplicates first" }

  & (Join-Path $root "prepare-topic-papers-review.ps1") `
    -BaseUrl $BaseUrl `
    -Email $Email `
    -Password $Password `
    -Topic $Topic `
    -TargetCount $DailyCount `
    -Model $Model

  $review = (Get-ChildItem -Path $outDir -Filter ($Topic + "-review-*.json") | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  if ([string]::IsNullOrWhiteSpace($review)) { throw "review json not found" }

  $parsed = Get-Content -Raw -Encoding UTF8 $review | ConvertFrom-Json
  $items = @()
  if ($parsed -is [System.Array]) {
    if ($parsed.Count -eq 1 -and $parsed[0] -is [System.Array]) { $items = @($parsed[0]) } else { $items = @($parsed) }
  } else { $items = @($parsed) }
  foreach ($it in $items) {
    $sum = [string]$it.aiSummary
    if ($sum -match "AI service unavailable") {
      $it.reviewStatus = "REJECTED"
      $it.reviewerNote = "AI unavailable"
    } else {
      $it.reviewStatus = "APPROVED"
      $it.reviewerNote = "approved by topic daily pipeline"
    }
  }
  $approvedCount = @($items | Where-Object { $_.reviewStatus -eq "APPROVED" }).Count
  [System.IO.File]::WriteAllText($review, ($items | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($true))

  & (Join-Path $root "upload-reviewed-papers.ps1") `
    -BaseUrl $BaseUrl `
    -Email $Email `
    -Password $Password `
    -ReviewJsonPath $review `
    -Source $source `
    -StatePath $StatePath

  $okCount = 0
  $failCount = 0
  $skipCount = 0
  if ($approvedCount -gt 0) {
    $prefix = $source + "-upload"
    $okFile = Get-ChildItem -Path $outDir -Filter ($prefix + "-ok-*.csv") | Where-Object { $_.LastWriteTime -ge $jobStartedAt.AddSeconds(-5) } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $failFile = Get-ChildItem -Path $outDir -Filter ($prefix + "-fail-*.csv") | Where-Object { $_.LastWriteTime -ge $jobStartedAt.AddSeconds(-5) } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $skipFile = Get-ChildItem -Path $outDir -Filter ($prefix + "-skip-*.csv") | Where-Object { $_.LastWriteTime -ge $jobStartedAt.AddSeconds(-5) } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $okCount = if ($okFile) { [Math]::Max((Get-Content $okFile.FullName).Count - 1, 0) } else { 0 }
    $failCount = if ($failFile) { [Math]::Max((Get-Content $failFile.FullName).Count - 1, 0) } else { 0 }
    $skipCount = if ($skipFile) { [Math]::Max((Get-Content $skipFile.FullName).Count - 1, 0) } else { 0 }
  }
  $end = GetTopicStats -baseUrl $BaseUrl -sourceName $source
  if ($end.dup -gt 0) { throw "duplicates detected after upload" }
  Write-Host ("DONE topic={0} ok={1} fail={2} skip={3} total={4}" -f $Topic, $okCount, $failCount, $skipCount, $end.count)
} finally {
  if (Test-Path $LockFile) { Remove-Item -Force $LockFile }
}
