param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [string]$ReviewJsonPath = "F:\Gitee\PaperFlow\PaperFlow\paperflow\scripts\out\medical-review-1775041055.json",
  [string]$EnvBatPath = "F:\Gitee\PaperFlow\PaperFlow\scripts\env\local.env.bat",
  [string]$Model = "glm-4-flash",
  [int]$MaxCount = 6
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Norm([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  return ($s -replace "\s+", " ").Trim()
}

function ParseEnvBat([string]$path) {
  if (!(Test-Path $path)) { throw "env file not found: $path" }
  $map = @{}
  $lines = Get-Content -Path $path -Encoding UTF8
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($t)) { continue }
    if ($t.StartsWith("@")) { continue }
    if ($t -notmatch "^set\s+([A-Za-z0-9_]+)=(.*)$") { continue }
    $k = $Matches[1]
    $v = $Matches[2]
    $map[$k] = $v
  }
  return $map
}

function NormalizeMarkdownText([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  $t = $s -replace "\r\n", "`n"
  $t = $t -replace "\s+###\s+", "`n### "
  $t = $t -replace "\s+##\s+", "`n## "
  $t = $t -replace "`n#`n#\s+", "`n## "
  $t = $t -replace "`n{3,}", "`n`n"
  return $t.Trim()
}

function CallGlmRewrite([string]$endpoint, [string]$apiKey, [string]$model, [string]$title, [string]$zhTitle, [string]$oneLine, [string]$sourceId, [string]$oldSummary) {
  $prompt = @(
    "You are a medical-informatics editor. Rewrite this paper note into publication-ready content.",
    "Output must be Markdown. Every heading must be on its own line. Never put ## inline with paragraph text.",
    "Use fixed sections:",
    "## Research Problem and Background",
    "## Method and Technical Route",
    "## Results and Evidence",
    "## Limitations and Scope",
    "## Engineering and Product Implications",
    "## Human Review Checklist",
    "Be detailed, auditable, and factual. No fabrication. If no numeric result, explicitly write: Abstract has no quantitative metrics.",
    "English title: $title",
    "Chinese title: $zhTitle",
    "One-line conclusion: $oneLine",
    "Source: $sourceId",
    "Existing summary: $oldSummary"
  ) -join "`n"
  $req = @{
    model = $model
    messages = @(
      @{ role = "system"; content = "You are a strict medical-informatics editor. No fabrication." },
      @{ role = "user"; content = $prompt }
    )
    temperature = 0.3
  } | ConvertTo-Json -Depth 8
  $reqBytes = [System.Text.Encoding]::UTF8.GetBytes($req)
  $resp = Invoke-RestMethod -Method POST -Uri $endpoint -Headers @{ Authorization = "Bearer $apiKey" } -ContentType "application/json; charset=utf-8" -Body $reqBytes -TimeoutSec 120
  $msg = ""
  if ($resp.choices -and $resp.choices.Count -gt 0 -and $resp.choices[0].message) {
    $msg = [string]$resp.choices[0].message.content
  }
  if ([string]::IsNullOrWhiteSpace($msg)) { throw "glm empty content" }
  return NormalizeMarkdownText $msg
}

if (!(Test-Path $ReviewJsonPath)) { throw "review json not found: $ReviewJsonPath" }
$envMap = ParseEnvBat $EnvBatPath
$endpoint = [string]$envMap["PF_PATHFINDER_AI_ENDPOINT"]
$apiKey = [string]$envMap["PF_PATHFINDER_AI_API_KEY"]
if ([string]::IsNullOrWhiteSpace($endpoint)) { throw "PF_PATHFINDER_AI_ENDPOINT missing in env" }
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "PF_PATHFINDER_AI_API_KEY missing in env" }

Write-Host "STEP 1 login backend..."
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "login failed" }

$raw = Get-Content -Raw -Encoding UTF8 $ReviewJsonPath
$parsed = $raw | ConvertFrom-Json
$items = @()
if ($parsed -is [System.Array]) {
  if ($parsed.Count -eq 1 -and $parsed[0] -is [System.Array]) { $items = @($parsed[0]) } else { $items = @($parsed) }
} else {
  $items = @($parsed)
}
$targets = @($items | Select-Object -First $MaxCount)
if ($targets.Count -eq 0) { throw "no items found in review json" }

$ok = @()
$fail = @()
$i = 0
foreach ($it in $targets) {
  $i++
  try {
    $title = [string]$it.title
    $zhTitle = [string]$it.zhTitle
    $one = [string]$it.oneLineConclusion
    $sourceId = [string]$it.sourceId
    $old = [string]$it.aiSummary
    Write-Host ("STEP 2 rewrite {0}/{1}: {2}" -f $i, $targets.Count, $title)
    $newMd = CallGlmRewrite -endpoint $endpoint -apiKey $apiKey -model $Model -title $title -zhTitle $zhTitle -oneLine $one -sourceId $sourceId -oldSummary $old
    $content = "# Paper Summary`n- One-line conclusion: $one`n`n$newMd"
    $it.payload.content = $content
    if ($it.payload.highlights -and $it.payload.highlights.Count -gt 0) {
      $it.payload.highlights[0].snippet = $content.Substring(0, [Math]::Min(180, $content.Length))
    }
    $body = $it.payload | ConvertTo-Json -Depth 12
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $res = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/papers/ingest" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" -Body $bodyBytes
    $ok += [pscustomobject]@{ index = $i; postId = [string]$res.data.postId; title = [string]$res.data.title }
    Write-Host ("OK {0}/{1} {2}" -f $i, $targets.Count, [string]$res.data.postId)
  } catch {
    $msg = $_.Exception.Message
    if ($_.ErrorDetails) { $msg = $msg + " | " + $_.ErrorDetails.Message }
    $fail += [pscustomobject]@{ index = $i; title = [string]$it.title; error = $msg }
    Write-Host ("FAIL {0}/{1} {2}" -f $i, $targets.Count, [string]$it.title)
  }
}

$outDir = Join-Path (Split-Path $ReviewJsonPath -Parent) ""
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$okPath = Join-Path $outDir ("medical-rewrite-reupload-ok-" + $ts + ".csv")
$failPath = Join-Path $outDir ("medical-rewrite-reupload-fail-" + $ts + ".csv")
$ok | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $okPath
$fail | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $failPath

Write-Host ("rewrite_reupload_ok=" + $ok.Count)
Write-Host ("rewrite_reupload_fail=" + $fail.Count)
Write-Host ("ok_csv=" + $okPath)
Write-Host ("fail_csv=" + $failPath)
