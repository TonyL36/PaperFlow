param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [int]$TargetTotal = 100,
  [int]$BatchSize = 10,
  [int]$MaxRounds = 20,
  [string]$Model = "glm-4-flash",
  [string]$StatePath = "F:\Gitee\PaperFlow\PaperFlow\scripts\state\medical-ingest-state.json"
)

$ErrorActionPreference = "Stop"

function GetMedicalStats([string]$baseUrl) {
  $all = @()
  for ($p = 1; $p -le 60; $p++) {
    $url = "$baseUrl/api/v1/posts?page[number]=$p&page[size]=200"
    $resp = Invoke-RestMethod -Method GET -Uri $url -TimeoutSec 25
    $items = @($resp.data.items)
    if ($items.Count -eq 0) { break }
    $all += $items
    if ($items.Count -lt 200) { break }
  }
  $med = @($all | Where-Object { $_.source -eq "agent-medical-review" })
  $dup = @($med | Group-Object title | Where-Object { $_.Count -gt 1 })
  return [pscustomobject]@{
    count = $med.Count
    dup = $dup.Count
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $root "paperflow\scripts\out"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$stats = GetMedicalStats -baseUrl $BaseUrl
Write-Host ("START count={0} dup={1}" -f $stats.count, $stats.dup)
if ($stats.dup -gt 0) {
  throw "duplicate titles exist online, please clean duplicates first"
}

$round = 0
$logs = @()
while ($stats.count -lt $TargetTotal -and $round -lt $MaxRounds) {
  $round++
  Write-Host ("ROUND {0} begin..." -f $round)

  & (Join-Path $root "prepare-medical-papers-review.ps1") `
    -BaseUrl $BaseUrl `
    -Email $Email `
    -Password $Password `
    -TargetCount $BatchSize `
    -Model $Model

  $review = (Get-ChildItem -Path $outDir -Filter "medical-review-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  if ([string]::IsNullOrWhiteSpace($review)) { throw "review json not found" }

  $items = @(Get-Content -Raw -Encoding UTF8 $review | ConvertFrom-Json)
  foreach ($it in $items) {
    $sum = [string]$it.aiSummary
    if ($sum -match "AI service unavailable|AI 服务当前不可用") {
      $it.reviewStatus = "REJECTED"
      $it.reviewerNote = "AI unavailable"
    } else {
      $it.reviewStatus = "APPROVED"
      $it.reviewerNote = "approved by pipeline"
    }
  }
  $json = $items | ConvertTo-Json -Depth 12
  [System.IO.File]::WriteAllText($review, $json, [System.Text.UTF8Encoding]::new($true))

  & (Join-Path $root "upload-reviewed-papers.ps1") `
    -BaseUrl $BaseUrl `
    -Email $Email `
    -Password $Password `
    -ReviewJsonPath $review `
    -StatePath $StatePath

  $ok = (Get-ChildItem -Path $outDir -Filter "medical-upload-ok-*.csv" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  $skip = (Get-ChildItem -Path $outDir -Filter "medical-upload-skip-*.csv" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  $okCount = if (Test-Path $ok) { [Math]::Max((Get-Content $ok).Count - 1, 0) } else { 0 }
  $skipCount = if (Test-Path $skip) { [Math]::Max((Get-Content $skip).Count - 1, 0) } else { 0 }

  $stats = GetMedicalStats -baseUrl $BaseUrl
  $logs += [pscustomobject]@{
    round = $round
    ok = $okCount
    skip = $skipCount
    total = $stats.count
    dup = $stats.dup
    review = $review
    okCsv = $ok
    skipCsv = $skip
  }

  Write-Host ("ROUND {0} done: ok={1}, skip={2}, total={3}, dup={4}" -f $round, $okCount, $skipCount, $stats.count, $stats.dup)
  if ($stats.dup -gt 0) {
    throw "duplicates detected after upload"
  }
}

Write-Host ("FINAL count={0} dup={1}" -f $stats.count, $stats.dup)
foreach ($x in $logs) {
  Write-Host ("{0}|ok={1}|skip={2}|total={3}|dup={4}|ok_csv={5}" -f $x.round, $x.ok, $x.skip, $x.total, $x.dup, $x.okCsv)
}
