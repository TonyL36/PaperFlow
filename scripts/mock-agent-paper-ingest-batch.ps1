param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$DemoToken = "demo-token",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [int]$TargetCount = 100,
  [int]$PerDomainFetch = 90
)

$ErrorActionPreference = "Stop"

function Normalize-Text([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ""
  }
  return ($text -replace "\s+", " ").Trim()
}

function Split-Sentences([string]$text) {
  $norm = Normalize-Text $text
  if ([string]::IsNullOrWhiteSpace($norm)) {
    return @()
  }
  $parts = $norm -split "(?<=[\.\!\?])\s+"
  return @($parts | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Is-Chinese-NameCandidate([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) {
    return $false
  }
  $tokens = @("Wang","Li","Zhang","Liu","Chen","Yang","Huang","Zhao","Wu","Zhou","Xu","Sun","Ma","Zhu","Hu","Guo","He","Gao","Lin","Luo","Zheng","Liang","Xie","Song","Tang","Han","Deng","Peng","Cao","Jiang","Yuan")
  foreach ($t in $tokens) {
    if ($name -match ("(^|[\s,])" + $t + "([\s,]|$)")) {
      return $true
    }
  }
  return $false
}

function Build-DomainQueries() {
  return @(
    @{ domain = "medical-informatics"; query = 'cat:cs.CL AND (all:biomedical OR all:clinical OR all:medical OR all:healthcare)' },
    @{ domain = "cybersecurity"; query = 'cat:cs.CR AND (all:security OR all:vulnerability OR all:malware OR all:intrusion)' },
    @{ domain = "ai-coding"; query = '(cat:cs.SE OR cat:cs.AI) AND (all:"code generation" OR all:"program synthesis" OR all:"coding agent" OR all:"code model")' },
    @{ domain = "game-development"; query = '(cat:cs.AI OR cat:cs.LG) AND (all:game OR all:gameplay OR all:"game development" OR all:"procedural generation")' }
  )
}

function Get-ArxivPapers([string]$domain, [string]$searchQuery, [int]$maxResults) {
  $encoded = [uri]::EscapeDataString($searchQuery)
  $url = "https://export.arxiv.org/api/query?search_query=$encoded&start=0&max_results=$maxResults&sortBy=submittedDate&sortOrder=descending"
  $headers = @{ "User-Agent" = "PaperFlow-BatchIngest/1.0 (local test)" }
  $content = $null
  for ($i = 0; $i -lt 3; $i++) {
    try {
      Write-Host ("FETCH [{0}] attempt {1}/3" -f $domain, ($i + 1))
      $resp = Invoke-WebRequest -Method GET -Uri $url -Headers $headers -TimeoutSec 40
      $content = $resp.Content
      break
    } catch {
      Start-Sleep -Seconds (2 + 2 * $i)
    }
  }
  if ([string]::IsNullOrWhiteSpace($content)) {
    return @()
  }
  [xml]$doc = $content
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace("a", "http://www.w3.org/2005/Atom")
  $entries = $doc.SelectNodes("//a:entry", $ns)
  $result = @()
  foreach ($e in $entries) {
    $idText = Normalize-Text($e.id.'#text')
    $title = Normalize-Text($e.title.'#text')
    $summary = Normalize-Text($e.summary.'#text')
    $published = Normalize-Text($e.published.'#text')
    $pdf = ""
    foreach ($lnk in $e.link) {
      if ($lnk.title -eq "pdf" -and $lnk.href) {
        $pdf = [string]$lnk.href
      }
    }
    if ([string]::IsNullOrWhiteSpace($pdf) -and $idText -match "arxiv\.org/abs/([0-9]+\.[0-9]+)") {
      $pdf = "https://arxiv.org/pdf/$($Matches[1]).pdf"
    }
    if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($pdf)) {
      continue
    }
    $authors = @()
    foreach ($a in $e.author) {
      $n = Normalize-Text($a.name.'#text')
      if (-not [string]::IsNullOrWhiteSpace($n)) {
        $authors += $n
      }
    }
    $primaryAuthor = if ($authors.Count -gt 0) { $authors[0] } else { "" }
    $region = if (Is-Chinese-NameCandidate $primaryAuthor) { "cn-candidate" } else { "global-candidate" }
    $sentences = Split-Sentences $summary
    $s1 = if ($sentences.Count -gt 0) { $sentences[0] } else { $summary }
    $s2 = if ($sentences.Count -gt 1) { $sentences[1] } else { $s1 }
    $titleCn = "论文速读：" + $title
    if ($titleCn.Length -gt 90) {
      $titleCn = $titleCn.Substring(0, 90)
    }
    $result += @{
      domain = $domain
      region = $region
      title = $titleCn
      originalTitle = $title
      summary = $summary
      key1 = $s1
      key2 = $s2
      pdf = $pdf
      published = $published
      primaryAuthor = $primaryAuthor
      authors = $authors
      sourceId = $idText
    }
  }
  return $result
}

function Invoke-Ingest([string]$baseUrl, [string]$token, [string]$demoToken, [string]$rid, [string]$payload) {
  try {
    return Invoke-RestMethod -Method POST `
      -Uri "$baseUrl/api/v1/internal/agent/papers" `
      -Headers @{ "X-Request-Id" = $rid; "X-Demo-Ingest-Token" = $demoToken; "Authorization" = "Bearer $token" } `
      -ContentType "application/json" `
      -Body $payload `
      -ErrorAction Stop
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    $err = $_.ErrorDetails.Message
    if (($statusCode -eq 404) -or ($err -and $err -like "*Endpoint not enabled*")) {
      return Invoke-RestMethod -Method POST `
        -Uri "$baseUrl/api/v1/papers/ingest" `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -ContentType "application/json" `
        -Body $payload `
        -ErrorAction Stop
    }
    throw
  }
}

Write-Host "STEP 1/5 login..."
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "login failed or account disabled"
}

Write-Host "STEP 2/5 fetch real papers..."
$all = @()
$queries = Build-DomainQueries
foreach ($q in $queries) {
  $all += Get-ArxivPapers -domain $q.domain -searchQuery $q.query -maxResults $PerDomainFetch
}

$dedup = @{}
$unique = @()
foreach ($p in $all) {
  $k = if ([string]::IsNullOrWhiteSpace($p.sourceId)) { $p.pdf } else { $p.sourceId }
  if (-not $dedup.ContainsKey($k)) {
    $dedup[$k] = $true
    $unique += $p
  }
}

$recent = @($unique | Where-Object {
  if ([string]::IsNullOrWhiteSpace($_.published)) { return $false }
  try { return ([datetime]$_.published -ge [datetime]"2023-01-01T00:00:00Z") } catch { return $false }
})
if ($recent.Count -eq 0) {
  $recent = $unique
}

$cn = @($recent | Where-Object { $_.region -eq "cn-candidate" })
$global = @($recent | Where-Object { $_.region -ne "cn-candidate" })
$selected = @()
$i = 0
while ($selected.Count -lt $TargetCount -and ($i -lt $cn.Count -or $i -lt $global.Count)) {
  if ($i -lt $cn.Count -and $selected.Count -lt $TargetCount) { $selected += $cn[$i] }
  if ($i -lt $global.Count -and $selected.Count -lt $TargetCount) { $selected += $global[$i] }
  $i++
}
if ($selected.Count -lt $TargetCount) {
  $extra = @($recent | Where-Object { $selected -notcontains $_ })
  foreach ($e in $extra) {
    if ($selected.Count -ge $TargetCount) { break }
    $selected += $e
  }
}
$selected = @($selected | Select-Object -First $TargetCount)

if ($selected.Count -eq 0) {
  throw "no papers fetched"
}

Write-Host ("STEP 3/5 ingest papers one by one... target={0}" -f $selected.Count)
$ok = @()
$fail = @()
$ridBase = "rid-batch-" + [DateTimeOffset]::Now.ToUnixTimeSeconds()
$idx = 0
foreach ($p in $selected) {
  $idx++
  $postId = "post_batch_" + [Guid]::NewGuid().ToString("N")
  $paperId = "paper_batch_" + [Guid]::NewGuid().ToString("N")
  $publishedAt = if ([string]::IsNullOrWhiteSpace($p.published)) { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } else { $p.published }
  $summary = Normalize-Text([string]$p.summary)
  if ([string]::IsNullOrWhiteSpace($summary)) {
    $summary = "This paper reports methods and findings relevant to the selected domain."
  }
  $key1 = Normalize-Text([string]$p.key1)
  if ([string]::IsNullOrWhiteSpace($key1)) { $key1 = $summary }
  $key2 = Normalize-Text([string]$p.key2)
  if ([string]::IsNullOrWhiteSpace($key2)) { $key2 = $summary }
  $safeTitle = [string]$p.title
  if ($safeTitle.Length -gt 96) { $safeTitle = $safeTitle.Substring(0, 96) }
  $contentLines = @(
    "# 中文发现",
    "- 研究方向: $($p.domain)",
    "- 国内外候选: $($p.region)",
    "- 研究问题(英文摘录): $key1",
    "- 方法与结论(英文摘录): $key2",
    "- 工程启发: 优先复现实验设置并关注数据分布与评价协议。",
    "- 风险与局限: 需结合任务数据与部署环境二次验证。",
    "",
    "## English Summary",
    "- Domain: $($p.domain)",
    "- Region candidate: $($p.region)",
    "- Problem: $key1",
    "- Findings: $key2",
    "- Abstract: $summary",
    "- Primary author: $($p.primaryAuthor)",
    "- Source paper title: $($p.originalTitle)"
  )
  $body = @{
    postId = $postId
    title = $safeTitle
    source = "agent-batch"
    content = ($contentLines -join "`n")
    paperId = $paperId
    formats = @(@{ type = "pdf"; url = $p.pdf })
    highlights = @(
      @{ highlightId = "h1"; page = 1; level = "claim"; title = "Problem"; snippet = $key1 },
      @{ highlightId = "h2"; page = 1; level = "evidence"; title = "Findings"; snippet = $key2 }
    )
    tags = @("paper", $p.domain, $p.region, "bilingual-summary", "agent-batch")
    publishedAt = $publishedAt
  } | ConvertTo-Json -Depth 10

  try {
    $rid = "$ridBase-$idx"
    Invoke-Ingest -baseUrl $BaseUrl -token $token -demoToken $DemoToken -rid $rid -payload $body | Out-Null
    $ok += @{ postId = $postId; title = $safeTitle; domain = $p.domain; pdf = $p.pdf }
    Write-Host ("OK {0}/{1} {2}" -f $idx, $selected.Count, $safeTitle)
  } catch {
    $fail += @{ index = $idx; title = $safeTitle; error = $_.Exception.Message }
    Write-Host ("FAIL {0}/{1} {2}" -f $idx, $selected.Count, $safeTitle)
  }
  Start-Sleep -Milliseconds 250
}

Write-Host ("STEP 4/5 done. ok={0} fail={1}" -f $ok.Count, $fail.Count)
$outDir = Join-Path (Get-Location) "paperflow\scripts\out"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$stamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$okPath = Join-Path $outDir ("ingest-ok-" + $stamp + ".csv")
$failPath = Join-Path $outDir ("ingest-fail-" + $stamp + ".csv")
$ok | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $okPath
$fail | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $failPath
Write-Host ("STEP 5/5 output: " + $okPath)
Write-Host ("STEP 5/5 output: " + $failPath)
