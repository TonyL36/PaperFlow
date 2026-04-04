param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [int]$TargetCount = 10,
  [string]$Model = "glm-4-flash",
  [string]$SeedJsonPath = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Norm([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  return ($s -replace "\s+", " ").Trim()
}

function FixMojibake([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  try {
    $hasLatin1Noise = $s -match '[\u00C0-\u00FF]' -or $s -match '[\u0080-\u00BF]'
    if (-not $hasLatin1Noise) { return $s }
    $bytes = [System.Text.Encoding]::GetEncoding(28591).GetBytes($s)
    $fixed = [System.Text.Encoding]::UTF8.GetString($bytes)
    if ($fixed -match '[\u4E00-\u9FFF]') { return $fixed }
  } catch {
  }
  return $s
}

function NormalizeMarkdownText([string]$s) {
  $t = FixMojibake($s)
  if ([string]::IsNullOrWhiteSpace($t)) { return "" }
  $t = $t -replace "\r\n", "`n"
  $t = $t -replace "\s+###\s+", "`n### "
  $t = $t -replace "\s+##\s+", "`n## "
  $t = $t -replace "`n#`n#\s+", "`n## "
  $t = $t -replace "`n{3,}", "`n`n"
  return $t.Trim()
}

function FetchRecentMedicalPapers([int]$maxResults) {
  $queries = @(
    'cat:cs.CL AND (all:biomedical OR all:clinical OR all:medical OR all:healthcare)',
    'cat:q-bio.QM AND (all:medical OR all:healthcare OR all:clinical)'
  )
  $all = @()
  foreach ($q in $queries) {
    for ($start = 0; $start -lt ($maxResults * 4); $start += $maxResults) {
      $enc = [uri]::EscapeDataString($q)
      $url = "https://export.arxiv.org/api/query?search_query=$enc&start=$start&max_results=$maxResults&sortBy=submittedDate&sortOrder=descending"
      $content = $null
      for ($i = 0; $i -lt 3; $i++) {
        try {
          $resp = Invoke-WebRequest -Method GET -Uri $url -Headers @{ "User-Agent" = "PaperFlow-ReviewPrep/1.0" } -TimeoutSec 40 -UseBasicParsing
          $content = $resp.Content
          break
        } catch {
          Start-Sleep -Seconds (2 + 2 * $i)
        }
      }
      if ([string]::IsNullOrWhiteSpace($content)) { continue }
      [xml]$doc = $content
      $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
      $ns.AddNamespace("a", "http://www.w3.org/2005/Atom")
      $entries = $doc.SelectNodes("//a:entry", $ns)
      foreach ($e in $entries) {
        $idNode = $e.SelectSingleNode("a:id", $ns)
        $titleNode = $e.SelectSingleNode("a:title", $ns)
        $summaryNode = $e.SelectSingleNode("a:summary", $ns)
        $pubNode = $e.SelectSingleNode("a:published", $ns)
        $idText = Norm([string]$idNode.InnerText)
        $title = Norm([string]$titleNode.InnerText)
        $summary = Norm([string]$summaryNode.InnerText)
        $published = Norm([string]$pubNode.InnerText)
        $pdf = ""
        foreach ($lnk in $e.link) {
          if ($lnk.title -eq "pdf" -and $lnk.href) { $pdf = [string]$lnk.href }
        }
        if ([string]::IsNullOrWhiteSpace($pdf) -and $idText -match "arxiv\.org/abs/([0-9]+\.[0-9]+)") {
          $pdf = "https://arxiv.org/pdf/$($Matches[1]).pdf"
        }
        if (-not [string]::IsNullOrWhiteSpace($pdf) -and $pdf -notmatch '\.pdf($|\?)') {
          $pdf = $pdf + ".pdf"
        }
        if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($pdf)) { continue }
        $all += [pscustomobject]@{
          sourceId = $idText
          title = $title
          summary = $summary
          publishedAt = $published
          pdfUrl = $pdf
        }
      }
    }
  }
  $uniq = @{}
  foreach ($p in $all) {
    $k = if ($p.sourceId) { $p.sourceId } else { $p.title.ToLowerInvariant() }
    if (-not $uniq.ContainsKey($k)) { $uniq[$k] = $p }
  }
  return @($uniq.Values | Sort-Object publishedAt -Descending)
}

function FetchExistingReviewTitleSet([string]$baseUrl) {
  $set = @{}
  $page = 1
  while ($true) {
    try {
      $url = "$baseUrl/api/v1/posts?page[number]=$page&page[size]=200"
      $resp = Invoke-RestMethod -Method GET -Uri $url -TimeoutSec 25
      $items = @($resp.data.items)
      if ($items.Count -eq 0) { break }
      foreach ($it in $items) {
        if ([string]$it.source -ne "agent-medical-review") { continue }
        $k = Norm([string]$it.title).ToLowerInvariant()
        if (-not [string]::IsNullOrWhiteSpace($k)) { $set[$k] = $true }
      }
      if ($items.Count -lt 200) { break }
      $page++
      if ($page -gt 20) { break }
    } catch {
      break
    }
  }
  return $set
}

function BuildAiSummary([string]$base, [string]$token, [string]$model, [string]$title, [string]$abstract) {
  $prompt = @(
    "Write a detailed paper summary based on title and abstract only. No fabrication.",
    "Language can be English or Chinese. Prefer clear professional style.",
    "Use this exact structure:",
    "## Research Problem and Background",
    "- 4 to 6 sentences.",
    "## Method and Technical Route",
    "- 5 to 8 sentences, include data/model/workflow details when available.",
    "## Results and Evidence",
    "- 5 to 8 sentences; if no numbers in abstract, state: abstract has no quantitative metrics.",
    "## Limitations and Scope",
    "- 3 to 5 sentences, include risk and generalization limits.",
    "## Engineering and Product Implications",
    "- 4 to 6 actionable bullets for medical AI systems.",
    "## Human Review Checklist",
    "- 3 to 5 bullets to verify facts.",
    "Title: $title",
    "Abstract: $abstract"
  ) -join "`n"
  $body = @{
    model = $model
    systemPrompt = "You are a strict medical informatics summarizer. Use only provided input and avoid fabrication."
    userPrompt = $prompt
  } | ConvertTo-Json -Depth 6
  try {
    $resp = Invoke-RestMethod -Method POST -Uri "$base/api/v1/ai/chat" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body -TimeoutSec 90
    return NormalizeMarkdownText([string]$resp.data.assistantMessage)
  } catch {
    return "AI service unavailable. Please retry later."
  }
}

function BuildReviewMeta([string]$base, [string]$token, [string]$model, [string]$title, [string]$abstract, [string]$summary) {
  $prompt = @(
    'Generate JSON only.',
    '{"zhTitle":"...","oneLineConclusion":"..."}',
    'zhTitle: concise Chinese translation of title, no quote.',
    'oneLineConclusion: one Chinese sentence, <= 50 chars, factual, no fabrication.',
    "Title: $title",
    "Abstract: $abstract",
    "Summary: $summary"
  ) -join "`n"
  $body = @{
    model = $model
    systemPrompt = "Return strict JSON only."
    userPrompt = $prompt
  } | ConvertTo-Json -Depth 6
  try {
    $resp = Invoke-RestMethod -Method POST -Uri "$base/api/v1/ai/chat" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body -TimeoutSec 60
    $txt = Norm(FixMojibake([string]$resp.data.assistantMessage))
    if ($txt.StartsWith('```')) {
      $txt = $txt -replace '^```[a-zA-Z]*', ''
      $txt = $txt -replace '```$', ''
      $txt = $txt.Trim()
    }
    $obj = $txt | ConvertFrom-Json
    $zh = Norm(FixMojibake([string]$obj.zhTitle))
    $one = Norm(FixMojibake([string]$obj.oneLineConclusion))
    if ([string]::IsNullOrWhiteSpace($zh)) { $zh = $title }
    if ([string]::IsNullOrWhiteSpace($one)) { $one = 'Need manual verification before publication.' }
    return [pscustomobject]@{ zhTitle = $zh; oneLineConclusion = $one }
  } catch {
    return [pscustomobject]@{ zhTitle = $title; oneLineConclusion = 'Need manual verification before publication.' }
  }
}

Write-Host "STEP 1 login..."
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "login failed" }

Write-Host "STEP 2 fetch recent papers..."
$papers = @()
if ([string]::IsNullOrWhiteSpace($SeedJsonPath)) {
  $existingTitles = FetchExistingReviewTitleSet -baseUrl $BaseUrl
} else {
  $existingTitles = @{}
}
if (-not [string]::IsNullOrWhiteSpace($SeedJsonPath) -and (Test-Path $SeedJsonPath)) {
  $candidates = @((Get-Content -Raw -Encoding UTF8 $SeedJsonPath | ConvertFrom-Json))
  $papers = @()
  foreach ($x in $candidates) {
    $k = Norm([string]$x.title).ToLowerInvariant()
    if ($existingTitles.ContainsKey($k)) { continue }
    $papers += $x
    if ($papers.Count -ge $TargetCount) { break }
  }
} else {
  $candidates = @(FetchRecentMedicalPapers -maxResults ([Math]::Max(20, $TargetCount * 2)))
  $papers = @()
  foreach ($x in $candidates) {
    $k = Norm([string]$x.title).ToLowerInvariant()
    if ($existingTitles.ContainsKey($k)) { continue }
    $papers += $x
    if ($papers.Count -ge $TargetCount) { break }
  }
  if ($papers.Count -eq 0) {
    throw "no papers fetched from arxiv"
  }
}

$items = @()
$i = 0
foreach ($p in $papers) {
  $i++
  $title = [string]$p.title
  $abstract = [string]$p.summary
  $domain = Norm([string]$p.domain)
  if ([string]::IsNullOrWhiteSpace($domain)) { $domain = "medical-informatics" }
  Write-Host ("STEP 3 summarize {0}/{1}: {2}" -f $i, $papers.Count, $title)
  $sum = BuildAiSummary -base $BaseUrl -token $token -model $Model -title $title -abstract $abstract
  if ([string]::IsNullOrWhiteSpace($sum)) { $sum = "Summary generation failed. Please edit manually." }
  $meta = BuildReviewMeta -base $BaseUrl -token $token -model $Model -title $title -abstract $abstract -summary $sum
  $zhTitle = [string]$meta.zhTitle
  $oneLine = [string]$meta.oneLineConclusion
  $postId = "post_review_med_" + [Guid]::NewGuid().ToString("N")
  $paperId = "paper_review_med_" + [Guid]::NewGuid().ToString("N")
  $content = "# Paper Summary (Pending Review)`n- One-line conclusion: $oneLine`n`n$sum"
  $snippet = if ($content.Length -gt 180) { $content.Substring(0, 180) } else { $content }
  $payload = @{
    postId = $postId
    title = $title
    source = "agent-medical-review"
    content = $content
    paperId = $paperId
    formats = @(@{ type = "pdf"; url = [string]$p.pdfUrl })
    highlights = @(@{ highlightId = "h1"; page = 1; level = "claim"; title = "AI Summary"; snippet = $snippet })
    tags = @("paper", $domain, "review-pending")
    publishedAt = if ([string]::IsNullOrWhiteSpace([string]$p.publishedAt)) { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } else { [string]$p.publishedAt }
  }
  $items += [pscustomobject]@{
    reviewStatus = "PENDING"
    reviewerNote = ""
    title = $title
    zhTitle = $zhTitle
    oneLineConclusion = $oneLine
    pdfUrl = [string]$p.pdfUrl
    sourceId = [string]$p.sourceId
    aiSummary = $sum
    payload = $payload
  }
}

$outDir = Join-Path (Get-Location) "paperflow\scripts\out"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$jsonPath = Join-Path $outDir ("medical-review-" + $ts + ".json")
$mdPath = Join-Path $outDir ("medical-review-" + $ts + ".md")
$jsonText = $items | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($jsonPath, $jsonText, [System.Text.UTF8Encoding]::new($true))

$lines = @("# Medical Informatics Paper Review List", "", "GeneratedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "")
$idx = 0
foreach ($it in $items) {
  $idx++
  $lines += "## $idx. $($it.title) ($($it.zhTitle))"
  $lines += "- OneLineConclusion: $($it.oneLineConclusion)"
  $lines += "- Status: $($it.reviewStatus)"
  $lines += "- sourceId: $($it.sourceId)"
  $lines += "- PDF: $($it.pdfUrl)"
  $lines += "- ReviewerNote: "
  $lines += ""
  $lines += "$($it.aiSummary)"
  $lines += ""
}
$mdText = ($lines -join "`r`n")
[System.IO.File]::WriteAllText($mdPath, $mdText, [System.Text.UTF8Encoding]::new($true))

Write-Host "DONE"
Write-Host ("review_json=" + $jsonPath)
Write-Host ("review_md=" + $mdPath)
