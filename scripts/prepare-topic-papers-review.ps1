param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [ValidateSet("medical","cybersecurity","bigdata")]
  [string]$Topic = "medical",
  [int]$TargetCount = 10,
  [string]$Model = "glm-4-flash"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Norm([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  return ($s -replace "\s+", " ").Trim()
}

function GetTopicMeta([string]$topic) {
  switch ($topic) {
    "medical" { return [pscustomobject]@{ source="agent-medical-review"; domain="medical-informatics"; label="Medical Informatics"; queries=@(
      'cat:cs.CL AND (all:biomedical OR all:clinical OR all:medical OR all:healthcare)',
      'cat:q-bio.QM AND (all:medical OR all:healthcare OR all:clinical)'
    ); fallback='all:medical OR all:clinical' } }
    "cybersecurity" { return [pscustomobject]@{ source="agent-cybersecurity-review"; domain="cybersecurity"; label="Cybersecurity"; queries=@(
      'cat:cs.CR AND (all:security OR all:vulnerability OR all:malware OR all:intrusion)',
      '(cat:cs.CR OR cat:cs.NI) AND (all:"threat detection" OR all:"network security" OR all:"attack")'
    ); fallback='cat:cs.CR AND (all:security OR all:cyber)' } }
    "bigdata" { return [pscustomobject]@{ source="agent-bigdata-review"; domain="big-data"; label="Big Data"; queries=@(
      '(cat:cs.DB OR cat:cs.DC OR cat:cs.LG) AND (all:"big data" OR all:"data engineering" OR all:"distributed data")',
      '(cat:cs.DB OR cat:cs.IR) AND (all:"data mining" OR all:"data warehouse" OR all:"stream processing")'
    ); fallback='cat:cs.DB AND (all:data OR all:database)' } }
  }
}

function FetchRecentPapers([string[]]$queries, [int]$maxResults) {
  $all = @()
  foreach ($q in $queries) {
    for ($start = 0; $start -lt ($maxResults * 4); $start += $maxResults) {
      $enc = [uri]::EscapeDataString($q)
      $url = "https://export.arxiv.org/api/query?search_query=$enc&start=$start&max_results=$maxResults&sortBy=submittedDate&sortOrder=descending"
      $content = $null
      for ($i = 0; $i -lt 3; $i++) {
        try {
          $resp = Invoke-WebRequest -Method GET -Uri $url -Headers @{ "User-Agent" = "PaperFlow-TopicPrep/1.0" } -TimeoutSec 40 -UseBasicParsing
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
        $idText = Norm([string]$e.id.InnerText)
        $title = Norm([string]$e.title.InnerText)
        $summary = Norm([string]$e.summary.InnerText)
        $published = Norm([string]$e.published.InnerText)
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

function BuildAiSummary([string]$base, [string]$token, [string]$model, [string]$topicLabel, [string]$title, [string]$abstract) {
  $prompt = @(
    "Write a detailed paper summary based on title and abstract only. No fabrication.",
    "Topic: $topicLabel",
    "Use this exact structure:",
    "## Problem and Context",
    "- 4 to 6 sentences.",
    "## Methods",
    "- 5 to 8 sentences.",
    "## Results and Evidence",
    "- 5 to 8 sentences.",
    "## Limitations",
    "- 3 to 5 sentences.",
    "## Practical Implications",
    "- 4 to 6 bullets.",
    "Title: $title",
    "Abstract: $abstract"
  ) -join "`n"
  $body = @{
    model = $model
    systemPrompt = "You are a strict technical summarizer. Use only provided input and avoid fabrication."
    userPrompt = $prompt
  } | ConvertTo-Json -Depth 6
  try {
    $resp = Invoke-RestMethod -Method POST -Uri "$base/api/v1/ai/chat" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body -TimeoutSec 90
    return Norm([string]$resp.data.assistantMessage)
  } catch {
    return "AI service unavailable. Please retry later."
  }
}

$meta = GetTopicMeta -topic $Topic
Write-Host "STEP 1 login..."
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "login failed" }

Write-Host "STEP 2 fetch recent papers..."
$existing = FetchExistingTitleSet -baseUrl $BaseUrl -source $meta.source
$candidates = @(FetchRecentPapers -queries $meta.queries -maxResults ([Math]::Max(20, $TargetCount * 2)))
$fallbackCandidates = @()
if ($candidates.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$meta.fallback)) {
  $fallbackCandidates = @(FetchRecentPapers -queries @([string]$meta.fallback) -maxResults 40)
}
$candidates += $fallbackCandidates
$papers = @()
foreach ($x in $candidates) {
  $k = Norm([string]$x.title).ToLowerInvariant()
  if ($existing.ContainsKey($k)) { continue }
  $papers += $x
  if ($papers.Count -ge $TargetCount) { break }
}
if ($papers.Count -eq 0) { throw "no papers fetched from arxiv" }

$items = @()
$i = 0
foreach ($p in $papers) {
  $i++
  $title = [string]$p.title
  $abstract = [string]$p.summary
  Write-Host ("STEP 3 summarize {0}/{1}: {2}" -f $i, $papers.Count, $title)
  $sum = BuildAiSummary -base $BaseUrl -token $token -model $Model -topicLabel $meta.label -title $title -abstract $abstract
  if ([string]::IsNullOrWhiteSpace($sum)) { $sum = "Summary generation failed. Please edit manually." }
  $postId = "post_review_" + $Topic + "_" + [Guid]::NewGuid().ToString("N")
  $paperId = "paper_review_" + $Topic + "_" + [Guid]::NewGuid().ToString("N")
  $content = "# Paper Summary (Pending Review)`n`n$sum"
  $snippet = if ($content.Length -gt 180) { $content.Substring(0, 180) } else { $content }
  $payload = @{
    postId = $postId
    title = $title
    source = $meta.source
    content = $content
    paperId = $paperId
    formats = @(@{ type = "pdf"; url = [string]$p.pdfUrl })
    highlights = @(@{ highlightId = "h1"; page = 1; level = "claim"; title = "AI Summary"; snippet = $snippet })
    tags = @("paper", $meta.domain, "review-pending")
    publishedAt = if ([string]::IsNullOrWhiteSpace([string]$p.publishedAt)) { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } else { [string]$p.publishedAt }
  }
  $items += [pscustomobject]@{
    reviewStatus = "PENDING"
    reviewerNote = ""
    title = $title
    sourceId = [string]$p.sourceId
    aiSummary = $sum
    payload = $payload
  }
}

$outDir = Join-Path (Get-Location) "paperflow\scripts\out"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$jsonPath = Join-Path $outDir ($Topic + "-review-" + $ts + ".json")
$mdPath = Join-Path $outDir ($Topic + "-review-" + $ts + ".md")
[System.IO.File]::WriteAllText($jsonPath, ($items | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($true))
$mdLines = @("# " + $meta.label + " Review List", "")
$idx = 0
foreach ($it in $items) {
  $idx++
  $mdLines += "## $idx. $($it.title)"
  $mdLines += "- Status: $($it.reviewStatus)"
  $mdLines += "- sourceId: $($it.sourceId)"
  $mdLines += ""
  $mdLines += "$($it.aiSummary)"
  $mdLines += ""
}
[System.IO.File]::WriteAllText($mdPath, ($mdLines -join "`r`n"), [System.Text.UTF8Encoding]::new($true))
Write-Host "DONE"
Write-Host ("review_json=" + $jsonPath)
Write-Host ("review_md=" + $mdPath)
