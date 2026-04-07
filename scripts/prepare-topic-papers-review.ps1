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
$curlBin = $null
foreach ($candidate in @("curl.exe", "curl")) {
  $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.CommandType -eq "Application") {
    $curlBin = $cmd.Source
    break
  }
}

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
  $t = $t -replace "\s+###\s+", "`n`n### "
  $t = $t -replace "\s+##\s+", "`n`n## "
  $sectionHeads = @(
    "Research Problem and Background",
    "Method and Technical Route",
    "Results and Evidence",
    "Limitations and Scope",
    "Engineering and Product Implications",
    "Human Review Checklist"
  )
  foreach ($h in $sectionHeads) {
    $pat = "\s*##\s*" + [regex]::Escape($h) + "\s*"
    $t = [regex]::Replace($t, $pat, "`n`n## $h`n")
  }
  $t = $t -replace "`n#`n#\s+", "`n## "
  $t = $t -replace "`n{3,}", "`n`n"
  return $t.Trim()
}

function BuildStructuredFallback([string]$topicLabel, [string]$abstract) {
  $base = Norm(FixMojibake($abstract))
  if ([string]::IsNullOrWhiteSpace($base)) {
    $base = "Abstract unavailable. Need original paper verification."
  }
  return @(
    "## Research Problem and Background",
    $base,
    "",
    "## Method and Technical Route",
    "- Refer to the original paper PDF for complete methodology.",
    "- Validate model assumptions and data workflow with full text.",
    "",
    "## Results and Evidence",
    "- Abstract has no quantitative metrics.",
    "- Verify evidence and numerical claims from the original paper.",
    "",
    "## Limitations and Scope",
    "- This summary is generated from title and abstract only.",
    "- Requires domain expert review before publication.",
    "",
    "## Engineering and Product Implications",
    "- Validate applicability for $topicLabel systems.",
    "- Add compliance, risk and safety checks before rollout.",
    "",
    "## Human Review Checklist",
    "- Confirm title, PDF, and summary refer to the same paper.",
    "- Verify metrics and experimental setup from the original text.",
    "- Verify boundary conditions and failure cases."
  ) -join "`n"
}

function HasRequiredSections([string]$s) {
  $t = NormalizeMarkdownText($s)
  if ([string]::IsNullOrWhiteSpace($t)) { return $false }
  $required = @(
    "## Research Problem and Background",
    "## Method and Technical Route",
    "## Results and Evidence",
    "## Limitations and Scope",
    "## Engineering and Product Implications",
    "## Human Review Checklist"
  )
  foreach ($h in $required) {
    if ($t -notmatch [regex]::Escape($h)) { return $false }
  }
  return $true
}

function GetTopicMeta([string]$topic) {
  switch ($topic) {
    "medical" { return [pscustomobject]@{ source="agent-medical-review"; domain="medical-informatics"; label="Medical Informatics"; queries=@(
      'cat:cs.CL AND (all:biomedical OR all:clinical OR all:medical OR all:healthcare)',
      'cat:q-bio.QM AND (all:medical OR all:healthcare OR all:clinical)'
    ); fallback='all:medical OR all:clinical' } }
    "cybersecurity" { return [pscustomobject]@{ source="agent-cybersecurity-review"; domain="cybersecurity"; label="Cybersecurity"; queries=@(
      '(all:security OR all:cybersecurity OR all:vulnerability OR all:malware OR all:intrusion)',
      '(all:"network security" OR all:"threat detection" OR all:"cyber attack" OR all:ransomware)'
    ); fallback='all:security OR all:cybersecurity' } }
    "bigdata" { return [pscustomobject]@{ source="agent-bigdata-review"; domain="big-data"; label="Big Data"; queries=@(
      '(all:"big data" OR all:"data engineering" OR all:"distributed data" OR all:"data platform")',
      '(all:"data mining" OR all:"stream processing" OR all:"data warehouse" OR all:"analytics pipeline")'
    ); fallback='all:"big data" OR all:"data mining" OR all:"distributed systems"' } }
  }
}

function FetchRecentPapers([string[]]$queries, [int]$maxResults) {
  $arxivHosts = @("https://export.arxiv.org", "https://arxiv.org")
  $scanMultiplier = 8
  $requestBudget = 24
  $requestCount = 0
  $rateLimitUntil = [datetime]::MinValue
  $all = @()
  foreach ($q in $queries) {
    if ($requestCount -ge $requestBudget) { break }
    for ($start = 0; $start -lt ($maxResults * $scanMultiplier); $start += $maxResults) {
      if ($requestCount -ge $requestBudget) { break }
      $enc = [uri]::EscapeDataString($q)
      $content = $null
      foreach ($arxivHost in $arxivHosts) {
        if ($requestCount -ge $requestBudget) { break }
        if (-not [string]::IsNullOrWhiteSpace($content)) { break }
        $url = "$arxivHost/api/query?search_query=$enc&start=$start&max_results=$maxResults&sortBy=submittedDate&sortOrder=descending"
        if ((Get-Date) -lt $rateLimitUntil) {
          Start-Sleep -Milliseconds 1500
        }
        for ($i = 0; $i -lt 3; $i++) {
          try {
            Start-Sleep -Milliseconds 450
            $requestCount++
            $resp = Invoke-WebRequest -Method GET -Uri $url -Headers @{ "User-Agent" = "PaperFlow-TopicPrep/1.0" } -TimeoutSec 40 -UseBasicParsing
            $content = $resp.Content
            break
          } catch {
            $statusCode = 0
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { $statusCode = 0 }
            if ($statusCode -eq 429) {
              $rateLimitUntil = (Get-Date).AddSeconds(25)
              Start-Sleep -Seconds (3 + 2 * $i)
              break
            }
            Start-Sleep -Seconds (2 + 2 * $i)
          }
        }
        if ([string]::IsNullOrWhiteSpace($content) -and $curlBin -and (Get-Date) -ge $rateLimitUntil) {
          try {
            $requestCount++
            $content = & $curlBin "-fsSL" "-A" "PaperFlow-TopicPrep/1.0" "--max-time" "40" $url
          } catch {
          }
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

function GetTopicRssFeeds([string]$topic) {
  switch ($topic) {
    "medical" { return @("https://rss.arxiv.org/rss/cs.CL", "https://rss.arxiv.org/rss/q-bio.QM") }
    "cybersecurity" { return @("https://rss.arxiv.org/rss/cs.CR", "https://rss.arxiv.org/rss/cs.NI") }
    "bigdata" { return @("https://rss.arxiv.org/rss/cs.DB", "https://rss.arxiv.org/rss/cs.DC", "https://rss.arxiv.org/rss/cs.DS") }
  }
  return @()
}

function FetchRecentPapersFromRss([string]$topic, [int]$maxPerFeed) {
  $feeds = @(GetTopicRssFeeds -topic $topic)
  $all = @()
  foreach ($feed in $feeds) {
    try {
      [xml]$rss = (Invoke-WebRequest -Method GET -Uri $feed -TimeoutSec 35 -UseBasicParsing).Content
      $items = @($rss.rss.channel.item)
      $count = 0
      foreach ($it in $items) {
        if ($count -ge $maxPerFeed) { break }
        $link = Norm([string]$it.link)
        $title = Norm([string]$it.title)
        $desc = [string]$it.description
        if ([string]::IsNullOrWhiteSpace($desc)) { $desc = "" }
        $summary = Norm(([regex]::Replace($desc, "<[^>]+>", " ")))
        $publishedAt = ""
        try {
          if (-not [string]::IsNullOrWhiteSpace([string]$it.pubDate)) {
            $publishedAt = ([datetimeoffset]::Parse([string]$it.pubDate)).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
          }
        } catch {
        }
        $pdf = ""
        if ($link -match "arxiv\.org/abs/([^/?#]+)") {
          $pdf = "https://arxiv.org/pdf/$($Matches[1]).pdf"
        }
        if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($pdf)) { continue }
        $all += [pscustomobject]@{
          sourceId = $link
          title = $title
          summary = $summary
          publishedAt = $publishedAt
          pdfUrl = $pdf
        }
        $count++
      }
    } catch {
    }
  }
  $uniq = @{}
  foreach ($p in $all) {
    $k = if ($p.sourceId) { $p.sourceId } else { $p.title.ToLowerInvariant() }
    if (-not $uniq.ContainsKey($k)) { $uniq[$k] = $p }
  }
  return @($uniq.Values | Sort-Object publishedAt -Descending)
}

function GetTopicFallbackQueries([string]$topic) {
  switch ($topic) {
    "medical" { return @(
      'cat:cs.CL AND (all:clinical OR all:medical OR all:healthcare)',
      'cat:q-bio.QM AND (all:biomedical OR all:clinical)'
    ) }
    "cybersecurity" { return @(
      '(cat:cs.CR OR cat:cs.NI) AND (all:security OR all:intrusion OR all:vulnerability)',
      '(all:"network security" OR all:"threat detection" OR all:"adversarial attack")'
    ) }
    "bigdata" { return @(
      '(cat:cs.DB OR cat:cs.DC OR cat:cs.DS) AND (all:data OR all:distributed OR all:stream)',
      '(all:"data engineering" OR all:"stream processing" OR all:"analytics pipeline")'
    ) }
  }
  return @()
}

function SelectNonDuplicatePapers(
  [object[]]$candidates,
  [hashtable]$existingTitleSet,
  [hashtable]$selectedTitleSet,
  [int]$needCount
) {
  $picked = @()
  foreach ($x in @($candidates | Sort-Object publishedAt -Descending)) {
    $k = Norm([string]$x.title).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($k)) { continue }
    if ($existingTitleSet.ContainsKey($k)) { continue }
    if ($selectedTitleSet.ContainsKey($k)) { continue }
    $selectedTitleSet[$k] = $true
    $picked += $x
    if ($picked.Count -ge $needCount) { break }
  }
  return @($picked)
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
    "Language can be English or Chinese. Prefer clear professional style.",
    "Topic: $topicLabel",
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
    "- 4 to 6 actionable bullets for $topicLabel systems.",
    "## Human Review Checklist",
    "- 3 to 5 bullets to verify facts.",
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

$meta = GetTopicMeta -topic $Topic
Write-Host "STEP 1 login..."
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "login failed" }

Write-Host "STEP 2 fetch recent papers..."
$existing = FetchExistingTitleSet -baseUrl $BaseUrl -source $meta.source
$papers = @()
$selectedTitleSet = @{}

$rssPerFeed = if ($Topic -eq "medical") { [Math]::Max(220, $TargetCount * 30) } else { [Math]::Max(120, $TargetCount * 16) }
$rssFirst = @(FetchRecentPapersFromRss -topic $Topic -maxPerFeed $rssPerFeed)
$papers += @(SelectNonDuplicatePapers -candidates $rssFirst -existingTitleSet $existing -selectedTitleSet $selectedTitleSet -needCount $TargetCount)

if ($papers.Count -lt $TargetCount) {
  $need = $TargetCount - $papers.Count
  $primaryCandidates = @(FetchRecentPapers -queries $meta.queries -maxResults ([Math]::Max(60, $TargetCount * 8)))
  $papers += @(SelectNonDuplicatePapers -candidates $primaryCandidates -existingTitleSet $existing -selectedTitleSet $selectedTitleSet -needCount $need)
}

if ($papers.Count -lt $TargetCount -and -not [string]::IsNullOrWhiteSpace([string]$meta.fallback)) {
  $need = $TargetCount - $papers.Count
  $fallbackCandidates = @(FetchRecentPapers -queries @([string]$meta.fallback) -maxResults ([Math]::Max(80, $TargetCount * 10)))
  $papers += @(SelectNonDuplicatePapers -candidates $fallbackCandidates -existingTitleSet $existing -selectedTitleSet $selectedTitleSet -needCount $need)
}

if ($papers.Count -lt $TargetCount) {
  $need = $TargetCount - $papers.Count
  $topicFallbackQueries = @(GetTopicFallbackQueries -topic $Topic)
  if ($topicFallbackQueries.Count -gt 0) {
    $broadCandidates = @(FetchRecentPapers -queries $topicFallbackQueries -maxResults ([Math]::Max(100, $TargetCount * 12)))
    $papers += @(SelectNonDuplicatePapers -candidates $broadCandidates -existingTitleSet $existing -selectedTitleSet $selectedTitleSet -needCount $need)
  }
}

if ($papers.Count -lt $TargetCount) {
  $need = $TargetCount - $papers.Count
  $rssCandidates = @(FetchRecentPapersFromRss -topic $Topic -maxPerFeed ([Math]::Max(40, $TargetCount * 6)))
  $papers += @(SelectNonDuplicatePapers -candidates $rssCandidates -existingTitleSet $existing -selectedTitleSet $selectedTitleSet -needCount $need)
}
if ($papers.Count -eq 0) {
  $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  $projectRoot = Split-Path -Parent $scriptRoot
  $outDir = Join-Path $projectRoot "paperflow\scripts\out"
  if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  $ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
  $jsonPath = Join-Path $outDir ($Topic + "-review-" + $ts + ".json")
  $mdPath = Join-Path $outDir ($Topic + "-review-" + $ts + ".md")
  [System.IO.File]::WriteAllText($jsonPath, "[]", [System.Text.UTF8Encoding]::new($true))
  $mdLines = @("# " + $meta.label + " Review List", "", "No new non-duplicate papers found.")
  [System.IO.File]::WriteAllText($mdPath, ($mdLines -join "`r`n"), [System.Text.UTF8Encoding]::new($true))
  Write-Host "DONE"
  Write-Host ("review_json=" + $jsonPath)
  Write-Host ("review_md=" + $mdPath)
  return
}

$items = @()
$i = 0
foreach ($p in $papers) {
  $i++
  $title = ([string]$p.title) -replace '\s*\(Daily\s+\d{4}-\d{2}-\d{2}\)\s*$', ''
  $abstract = [string]$p.summary
  Write-Host ("STEP 3 summarize {0}/{1}: {2}" -f $i, $papers.Count, $title)
  $sum = BuildAiSummary -base $BaseUrl -token $token -model $Model -topicLabel $meta.label -title $title -abstract $abstract
  if ([string]::IsNullOrWhiteSpace($sum)) { $sum = "Summary generation failed. Please edit manually." }
  if (-not (HasRequiredSections $sum)) {
    $sum = BuildStructuredFallback -topicLabel $meta.label -abstract $abstract
  } else {
    $sum = NormalizeMarkdownText($sum)
  }
  $reviewMeta = BuildReviewMeta -base $BaseUrl -token $token -model $Model -title $title -abstract $abstract -summary $sum
  $oneLine = [string]$reviewMeta.oneLineConclusion
  $postId = "post_review_" + $Topic + "_" + [Guid]::NewGuid().ToString("N")
  $paperId = "paper_review_" + $Topic + "_" + [Guid]::NewGuid().ToString("N")
  $content = "# Paper Summary (Pending Review)`n- One-line conclusion: $oneLine`n`n$sum"
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

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$outDir = Join-Path $projectRoot "paperflow\scripts\out"
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
