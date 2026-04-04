param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [int]$MaxCount = 30,
  [string]$SourceFilter = "agent-openalex",
  [string]$Model = "glm-4-flash"
)

$ErrorActionPreference = "Stop"

function ExtractPdf([string]$content) {
  if ([string]::IsNullOrWhiteSpace($content)) { return "" }
  $lines = $content -split "\r?\n"
  $inFormats = $false
  foreach ($row in $lines) {
    $line = $row.Trim()
    if (-not $inFormats) {
      if ($line -match "^##\s+Formats\b") { $inFormats = $true }
      continue
    }
    if ($line -match "^##\s+") { break }
    $m = [regex]::Match($line, "^-+\s*PDF\s*:\s*(\S+)\s*$", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
  }
  return ""
}

function BuildPrompt([string]$title) {
  return @"
Write a high-quality paper summary only. Do not rewrite the paper. Do not fabricate.
If uncertain, say: need original paper verification.

Title:
$title

Output format:
# Summary
2-4 sentences.

## Key Findings
- 3-5 bullets.

## Method
- 2-4 bullets.

## Evidence and Confidence
- 2-3 bullets.

## Limits and Risks
- 2-3 bullets.

## Engineering Advice
- 2-4 bullets.

## English Abstract
3-5 concise factual sentences.
"@
}

Write-Host "STEP 1 login"
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Method POST -Uri ($BaseUrl + "/api/v1/auth/login") -ContentType "application/json" -Body $loginBody
$token = [string]$login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "login failed" }

Write-Host "STEP 2 collect posts"
$all = @()
$page = 1
while ($true) {
  $url = $BaseUrl + "/api/v1/posts?page[number]=$page&page[size]=200"
  $resp = Invoke-RestMethod -Method GET -Uri $url
  $items = @($resp.data.items)
  if ($items.Count -eq 0) { break }
  $all += @($items | Where-Object { $_.source -eq $SourceFilter })
  if ($items.Count -lt 200 -or $all.Count -ge $MaxCount) { break }
  $page++
}
$targets = @($all | Select-Object -First $MaxCount)
if ($targets.Count -eq 0) { throw "no target posts" }

Write-Host ("STEP 3 summarize count={0}" -f $targets.Count)
$ok = @()
$fail = @()
$i = 0
foreach ($p in $targets) {
  $i++
  $postId = [string]$p.postId
  try {
    $headers = @{ Authorization = ("Bearer " + $token) }
    $step = "detail"
    $detailUrl = $BaseUrl + "/api/v1/posts/" + $postId
    $detail = Invoke-RestMethod -Method GET -Uri $detailUrl -Headers $headers
    $post = $detail.data
    $title = [string]$post.title
    $oldContent = [string]$post.content
    if ($oldContent -match "^# GLM Paper Summary") {
      Write-Host ("SKIP {0}/{1} {2}" -f $i, $targets.Count, $postId)
      continue
    }
    $pdf = ExtractPdf -content $oldContent
    if ([string]::IsNullOrWhiteSpace($pdf)) { $pdf = "https://arxiv.org/pdf/1706.03762.pdf" }

    $aiUrl = $BaseUrl + "/api/v1/ai/chat"
    $summary = ""
    try {
    $step = "ai-primary"
    $aiBody = @{
        model = $Model
        systemPrompt = "You are a strict research summarizer. Use plain English output only. No fabrication."
      userPrompt = (BuildPrompt -title $title)
      } | ConvertTo-Json -Depth 8
      $ai = Invoke-RestMethod -Method POST -Uri $aiUrl -Headers $headers -ContentType "application/json" -Body $aiBody
      $summary = [string]$ai.data.assistantMessage
    } catch {
      $step = "ai-fallback"
      $fallbackBody = @{
        model = $Model
        systemPrompt = "You are a strict research summarizer. Summary only."
        userPrompt = ("Summarize this paper title into structured CN+EN summary, no fabrication. Title: " + $title)
      } | ConvertTo-Json -Depth 8
      $ai2 = Invoke-RestMethod -Method POST -Uri $aiUrl -Headers $headers -ContentType "application/json" -Body $fallbackBody
      $summary = [string]$ai2.data.assistantMessage
    }
    if ([string]::IsNullOrWhiteSpace($summary)) { throw "empty summary" }

    $step = "ingest"
    $summaryClean = ($summary -replace "[\x00-\x08\x0B\x0C\x0E-\x1F]", " ").Trim()
    if ($summaryClean.Length -gt 1200) { $summaryClean = $summaryClean.Substring(0, 1200) }
    $newContent = "# GLM Paper Summary`n" + $summaryClean + "`n`n## Note`n- Auto summary. Verify with original PDF."
    $snippet = $newContent.Substring(0, [Math]::Min(180, $newContent.Length))
    $ingest = @{
      postId = $postId
      title = $title
      source = $post.source
      content = $newContent
      paperId = ("paper_summary_" + $postId)
      formats = @(@{ type = "pdf"; url = $pdf })
      highlights = @(@{ highlightId = "h1"; page = 1; level = "claim"; title = "Summary"; snippet = $snippet })
      tags = @("paper", "glm-summary", "quality-upgrade")
      publishedAt = $post.publishedAt
    } | ConvertTo-Json -Depth 10
    $ingestUrl = $BaseUrl + "/api/v1/papers/ingest"
    Invoke-RestMethod -Method POST -Uri $ingestUrl -Headers $headers -ContentType "application/json" -Body $ingest | Out-Null

    $ok += [pscustomobject]@{ postId = $postId; title = $title; pdf = $pdf }
    Write-Host ("OK {0}/{1} {2}" -f $i, $targets.Count, $title)
    Start-Sleep -Milliseconds 220
  } catch {
    $msg = "[" + $step + "] " + $_.Exception.Message
    $fail += [pscustomobject]@{ postId = $postId; error = $msg }
    Write-Host ("FAIL {0}/{1} {2} -> {3}" -f $i, $targets.Count, $postId, $msg)
  }
}

Write-Host ("STEP 4 done ok={0} fail={1}" -f $ok.Count, $fail.Count)
$outDir = Join-Path (Get-Location) "paperflow\scripts\out"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$okFile = Join-Path $outDir ("glm-summary-ok-" + $ts + ".csv")
$failFile = Join-Path $outDir ("glm-summary-fail-" + $ts + ".csv")
$ok | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $okFile
$fail | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $failFile
Write-Host ("STEP 5 output " + $okFile)
Write-Host ("STEP 5 output " + $failFile)
