param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [string]$ReviewJsonPath,
  [string]$Source = "agent-medical-review",
  [string]$StatePath = "F:\Gitee\PaperFlow\PaperFlow\scripts\state\medical-ingest-state.json"
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($ReviewJsonPath)) { throw "ReviewJsonPath is required" }
if (!(Test-Path $ReviewJsonPath)) { throw "review json not found: $ReviewJsonPath" }

function Norm([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  return ($s -replace "\s+", " ").Trim().ToLowerInvariant()
}

function FetchExistingTitleSet([string]$baseUrl, [string]$source) {
  $set = @{}
  $page = 1
  while ($true) {
    try {
      $url = "$baseUrl/api/v1/posts?page[number]=$page&page[size]=200"
      $resp = Invoke-RestMethod -Method GET -Uri $url -TimeoutSec 25
      $items = @($resp.data.items)
      if ($items.Count -eq 0) { break }
      foreach ($it in $items) {
        if ([string]$it.source -ne $source) { continue }
        $k = Norm([string]$it.title)
        if (-not [string]::IsNullOrWhiteSpace($k)) { $set[$k] = $true }
      }
      if ($items.Count -lt 200) { break }
      $page++
      if ($page -gt 30) { break }
    } catch {
      break
    }
  }
  return $set
}

function LoadState([string]$path) {
  if (!(Test-Path $path)) {
    return [pscustomobject]@{ sourceIds = @(); updatedAt = "" }
  }
  try {
    $obj = Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json
    $ids = @()
    if ($obj.sourceIds) { $ids = @($obj.sourceIds) }
    return [pscustomobject]@{ sourceIds = $ids; updatedAt = [string]$obj.updatedAt }
  } catch {
    return [pscustomobject]@{ sourceIds = @(); updatedAt = "" }
  }
}

function SaveState([string]$path, [object]$state) {
  $dir = Split-Path -Parent $path
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $state.updatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $json = $state | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($true))
}

Write-Host "STEP 1 login..."
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "login failed" }

$raw = Get-Content -Raw -Encoding UTF8 $ReviewJsonPath
$parsed = $raw | ConvertFrom-Json
$items = @()
if ($parsed -is [System.Array]) {
  if ($parsed.Count -eq 1 -and $parsed[0] -is [System.Array]) {
    $items = @($parsed[0])
  } else {
    $items = @($parsed)
  }
} else {
  $items = @($parsed)
}
$approved = @($items | Where-Object { $_.reviewStatus -eq "APPROVED" })
if ($approved.Count -eq 0) {
  Write-Host "No APPROVED items, nothing uploaded."
  exit 0
}
Write-Host ("STEP 2 approved count=" + $approved.Count)
$existingTitleSet = FetchExistingTitleSet -baseUrl $BaseUrl -source $Source
$state = LoadState -path $StatePath
$knownSourceIds = @{}
foreach ($x in @($state.sourceIds)) {
  $k = Norm([string]$x)
  if (-not [string]::IsNullOrWhiteSpace($k)) { $knownSourceIds[$k] = $true }
}
$runTitleSet = @{}
$runSourceSet = @{}

$ok = @()
$fail = @()
$skip = @()
$i = 0
foreach ($it in $approved) {
  $i++
  try {
    $titleNorm = Norm([string]$it.title)
    $srcNorm = Norm([string]$it.sourceId)
    if (-not [string]::IsNullOrWhiteSpace($titleNorm)) {
      if ($existingTitleSet.ContainsKey($titleNorm) -or $runTitleSet.ContainsKey($titleNorm)) {
        $skip += [pscustomobject]@{ index = $i; title = [string]$it.title; reason = "duplicate_title" }
        Write-Host ("SKIP {0}/{1} {2}" -f $i, $approved.Count, [string]$it.title)
        continue
      }
    }
    if (-not [string]::IsNullOrWhiteSpace($srcNorm)) {
      if ($knownSourceIds.ContainsKey($srcNorm) -or $runSourceSet.ContainsKey($srcNorm)) {
        $skip += [pscustomobject]@{ index = $i; title = [string]$it.title; reason = "duplicate_sourceId" }
        Write-Host ("SKIP {0}/{1} {2}" -f $i, $approved.Count, [string]$it.title)
        continue
      }
    }
    $body = $it.payload | ConvertTo-Json -Depth 12
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $res = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/papers/ingest" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" -Body $bodyBytes
    $ok += [pscustomobject]@{ index = $i; postId = [string]$res.data.postId; title = [string]$res.data.title }
    if (-not [string]::IsNullOrWhiteSpace($titleNorm)) {
      $existingTitleSet[$titleNorm] = $true
      $runTitleSet[$titleNorm] = $true
    }
    if (-not [string]::IsNullOrWhiteSpace($srcNorm)) {
      $knownSourceIds[$srcNorm] = $true
      $runSourceSet[$srcNorm] = $true
    }
    Write-Host ("OK {0}/{1} {2}" -f $i, $approved.Count, [string]$res.data.title)
  } catch {
    $fail += [pscustomobject]@{ index = $i; title = [string]$it.title; error = $_.Exception.Message }
    Write-Host ("FAIL {0}/{1} {2}" -f $i, $approved.Count, [string]$it.title)
  }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$outDir = Join-Path $projectRoot "paperflow\scripts\out"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$prefix = if ([string]::IsNullOrWhiteSpace($Source)) { "upload" } else { $Source + "-upload" }
$okPath = Join-Path $outDir ($prefix + "-ok-" + $ts + ".csv")
$failPath = Join-Path $outDir ($prefix + "-fail-" + $ts + ".csv")
$skipPath = Join-Path $outDir ($prefix + "-skip-" + $ts + ".csv")
$ok | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $okPath
$fail | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $failPath
$skip | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $skipPath
$state.sourceIds = @($knownSourceIds.Keys | Sort-Object)
SaveState -path $StatePath -state $state
Write-Host ("ok_csv=" + $okPath)
Write-Host ("fail_csv=" + $failPath)
Write-Host ("skip_csv=" + $skipPath)
