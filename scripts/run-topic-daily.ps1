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
  $rows = @($all | Where-Object { $_.source -eq $sourceName })
  $dup = @($rows | Group-Object title | Where-Object { $_.Count -gt 1 })
  return [pscustomobject]@{ count = $rows.Count; dup = $dup.Count }
}

$stateDir = Split-Path -Parent $LockFile
if (!(Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
if (Test-Path $LockFile) { throw "$Topic daily job already running" }
[System.IO.File]::WriteAllText($LockFile, ((Get-Date).ToString("s")), [System.Text.UTF8Encoding]::new($true))

try {
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
  [System.IO.File]::WriteAllText($review, ($items | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($true))

  & (Join-Path $root "upload-reviewed-papers.ps1") `
    -BaseUrl $BaseUrl `
    -Email $Email `
    -Password $Password `
    -ReviewJsonPath $review `
    -Source $source `
    -StatePath $StatePath

  $ok = (Get-ChildItem -Path $outDir -Filter "medical-upload-ok-*.csv" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  $fail = (Get-ChildItem -Path $outDir -Filter "medical-upload-fail-*.csv" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  $skip = (Get-ChildItem -Path $outDir -Filter "medical-upload-skip-*.csv" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  $okCount = if (Test-Path $ok) { [Math]::Max((Get-Content $ok).Count - 1, 0) } else { 0 }
  $failCount = if (Test-Path $fail) { [Math]::Max((Get-Content $fail).Count - 1, 0) } else { 0 }
  $skipCount = if (Test-Path $skip) { [Math]::Max((Get-Content $skip).Count - 1, 0) } else { 0 }
  $end = GetTopicStats -baseUrl $BaseUrl -sourceName $source
  if ($end.dup -gt 0) { throw "duplicates detected after upload" }
  Write-Host ("DONE topic={0} ok={1} fail={2} skip={3} total={4}" -f $Topic, $okCount, $failCount, $skipCount, $end.count)
} finally {
  if (Test-Path $LockFile) { Remove-Item -Force $LockFile }
}
