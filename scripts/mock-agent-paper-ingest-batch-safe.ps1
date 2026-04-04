param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$DemoToken = "demo-token",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [int]$TargetCount = 100,
  [int]$PerDomainFetch = 80,
  [switch]$UseAiSummary
)

$ErrorActionPreference = "Stop"

function Norm([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  return ($s -replace "\s+", " ").Trim()
}

function SplitSent([string]$s) {
  $n = Norm $s
  if ([string]::IsNullOrWhiteSpace($n)) { return @() }
  return @($n -split "(?<=[\.\!\?])\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function IsCnCandidate([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $false }
  $tokens = @("Wang","Li","Zhang","Liu","Chen","Yang","Huang","Zhao","Wu","Zhou","Xu","Sun","Ma","Zhu","Hu","Guo","He","Gao","Lin","Luo","Zheng","Liang","Xie","Song","Tang","Han","Deng","Peng","Cao","Jiang","Yuan")
  foreach ($t in $tokens) {
    if ($name -match ("(^|[\s,])" + $t + "([\s,]|$)")) { return $true }
  }
  return $false
}

function Queries() {
  return @(
    @{ domain = "medical-informatics"; query = 'cat:cs.CL AND (all:biomedical OR all:clinical OR all:medical OR all:healthcare)' },
    @{ domain = "cybersecurity"; query = 'cat:cs.CR AND (all:security OR all:vulnerability OR all:malware OR all:intrusion)' },
    @{ domain = "ai-coding"; query = '(cat:cs.SE OR cat:cs.AI) AND (all:"code generation" OR all:"program synthesis" OR all:"coding agent" OR all:"code model")' },
    @{ domain = "game-development"; query = '(cat:cs.AI OR cat:cs.LG) AND (all:game OR all:gameplay OR all:"game development" OR all:"procedural generation")' }
  )
}

function FetchArxiv([string]$domain, [string]$query, [int]$maxResults) {
  $enc = [uri]::EscapeDataString($query)
  $url = "https://export.arxiv.org/api/query?search_query=$enc&start=0&max_results=$maxResults&sortBy=submittedDate&sortOrder=descending"
  $headers = @{ "User-Agent" = "PaperFlow-BatchSafe/1.0" }
  $content = $null
  for ($i = 0; $i -lt 3; $i++) {
    try {
      Write-Host ("FETCH {0} try {1}/3" -f $domain, ($i + 1))
      $resp = Invoke-WebRequest -Method GET -Uri $url -Headers $headers -TimeoutSec 40
      $content = $resp.Content
      break
    } catch {
      Start-Sleep -Seconds (2 + 2 * $i)
    }
  }
  if ([string]::IsNullOrWhiteSpace($content)) { return @() }
  [xml]$doc = $content
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace("a", "http://www.w3.org/2005/Atom")
  $entries = $doc.SelectNodes("//a:entry", $ns)
  $out = @()
  foreach ($e in $entries) {
    $idText = Norm($e.id.'#text')
    $title = Norm($e.title.'#text')
    $summary = Norm($e.summary.'#text')
    $published = Norm($e.published.'#text')
    $pdf = ""
    foreach ($lnk in $e.link) {
      if ($lnk.title -eq "pdf" -and $lnk.href) { $pdf = [string]$lnk.href }
    }
    if ([string]::IsNullOrWhiteSpace($pdf) -and $idText -match "arxiv\.org/abs/([0-9]+\.[0-9]+)") { $pdf = "https://arxiv.org/pdf/$($Matches[1]).pdf" }
    if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($pdf)) { continue }
    $authors = @()
    foreach ($a in $e.author) {
      $n = Norm($a.name.'#text')
      if (-not [string]::IsNullOrWhiteSpace($n)) { $authors += $n }
    }
    $first = if ($authors.Count -gt 0) { $authors[0] } else { "" }
    $region = if (IsCnCandidate $first) { "cn-candidate" } else { "global-candidate" }
    $sents = SplitSent $summary
    $s1 = if ($sents.Count -gt 0) { $sents[0] } else { $summary }
    $s2 = if ($sents.Count -gt 1) { $sents[1] } else { $s1 }
    $out += @{
      domain = $domain
      region = $region
      title = $title
      summary = $summary
      key1 = $s1
      key2 = $s2
      pdf = $pdf
      published = $published
      firstAuthor = $first
      sourceId = $idText
    }
  }
  return $out
}

function Ingest([string]$base, [string]$token, [string]$demo, [string]$rid, [string]$jsonBody) {
  try {
    return Invoke-RestMethod -Method POST -Uri "$base/api/v1/internal/agent/papers" -Headers @{ "X-Request-Id" = $rid; "X-Demo-Ingest-Token" = $demo; "Authorization" = "Bearer $token" } -ContentType "application/json" -Body $jsonBody -ErrorAction Stop
  } catch {
    $code = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = $_.ErrorDetails.Message
    if (($code -eq 404) -or ($msg -and $msg -like "*Endpoint not enabled*")) {
      return Invoke-RestMethod -Method POST -Uri "$base/api/v1/papers/ingest" -Headers @{ "Authorization" = "Bearer $token" } -ContentType "application/json" -Body $jsonBody -ErrorAction Stop
    }
    throw
  }
}

function BuildSummaryByAi([string]$base, [string]$token, [string]$title, [string]$abstract, [string]$domain) {
  $prompt = @(
    "You are a research assistant.",
    "Generate concise bilingual summary for testing content ingestion.",
    "Output plain text with sections:",
    "CN-发现, CN-方法, CN-局限, EN-Findings, EN-Method, EN-Limits.",
    "Keep each section under 2 lines.",
    "Domain: $domain",
    "Title: $title",
    "Abstract: $abstract"
  ) -join "`n"
  try {
    $req = @{ prompt = $prompt; model = "glm-4-flash" } | ConvertTo-Json
    $resp = Invoke-RestMethod -Method POST -Uri "$base/api/v1/ai/chat" -Headers @{ "Authorization" = "Bearer $token" } -ContentType "application/json" -Body $req -ErrorAction Stop
    $m = $resp.data.assistantMessage
    if (-not [string]::IsNullOrWhiteSpace($m)) { return [string]$m }
  } catch {
  }
  return ""
}

Write-Host "STEP 1 login"
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "login failed" }

Write-Host "STEP 2 fetch papers"
$pool = @()
foreach ($q in (Queries)) { $pool += FetchArxiv -domain $q.domain -query $q.query -maxResults $PerDomainFetch }
$map = @{}
$uniq = @()
foreach ($p in $pool) {
  $k = if ([string]::IsNullOrWhiteSpace($p.sourceId)) { $p.pdf } else { $p.sourceId }
  if (-not $map.ContainsKey($k)) { $map[$k] = $true; $uniq += $p }
}
$recent = @($uniq | Where-Object { try { ([datetime]$_.published -ge [datetime]"2023-01-01T00:00:00Z") } catch { $false } })
if ($recent.Count -eq 0) { $recent = $uniq }
$cn = @($recent | Where-Object { $_.region -eq "cn-candidate" })
$gl = @($recent | Where-Object { $_.region -ne "cn-candidate" })
$sel = @()
$i = 0
while ($sel.Count -lt $TargetCount -and ($i -lt $cn.Count -or $i -lt $gl.Count)) {
  if ($i -lt $cn.Count -and $sel.Count -lt $TargetCount) { $sel += $cn[$i] }
  if ($i -lt $gl.Count -and $sel.Count -lt $TargetCount) { $sel += $gl[$i] }
  $i++
}
if ($sel.Count -lt $TargetCount) {
  foreach ($p in $recent) {
    if ($sel.Count -ge $TargetCount) { break }
    if ($sel -contains $p) { continue }
    $sel += $p
  }
}
$sel = @($sel | Select-Object -First $TargetCount)
if ($sel.Count -eq 0) { throw "no papers selected" }

Write-Host ("STEP 3 ingest one by one target={0}" -f $sel.Count)
$ok = @()
$fail = @()
$ridBase = "rid-batch-safe-" + [DateTimeOffset]::Now.ToUnixTimeSeconds()
$idx = 0
foreach ($p in $sel) {
  $idx++
  $postId = "post_batch_" + [Guid]::NewGuid().ToString("N")
  $paperId = "paper_batch_" + [Guid]::NewGuid().ToString("N")
  $title = [string]$p.title
  if ($title.Length -gt 96) { $title = $title.Substring(0, 96) }
  $summary = Norm([string]$p.summary)
  if ([string]::IsNullOrWhiteSpace($summary)) { $summary = "No abstract available." }
  $k1 = Norm([string]$p.key1); if ([string]::IsNullOrWhiteSpace($k1)) { $k1 = $summary }
  $k2 = Norm([string]$p.key2); if ([string]::IsNullOrWhiteSpace($k2)) { $k2 = $summary }
  $pub = if ([string]::IsNullOrWhiteSpace($p.published)) { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } else { $p.published }
  $aiText = ""
  if ($UseAiSummary) { $aiText = BuildSummaryByAi -base $BaseUrl -token $token -title $title -abstract $summary -domain ([string]$p.domain) }
  $contentLines = @(
    "# CN Summary",
    "- Domain: $($p.domain)",
    "- Region candidate: $($p.region)",
    "- Problem excerpt: $k1",
    "- Findings excerpt: $k2",
    "- Limit note: Verify with full paper and experiment setup.",
    "",
    "## EN Summary",
    "- Domain: $($p.domain)",
    "- Region candidate: $($p.region)",
    "- Problem: $k1",
    "- Findings: $k2",
    "- Abstract: $summary",
    "- First author: $($p.firstAuthor)",
    "- Source: $($p.sourceId)"
  )
  if (-not [string]::IsNullOrWhiteSpace($aiText)) {
    $contentLines += ""
    $contentLines += "## AI Enhanced Summary"
    $contentLines += $aiText
  }
  $body = @{
    postId = $postId
    title = $title
    source = "agent-batch"
    content = ($contentLines -join "`n")
    paperId = $paperId
    formats = @(@{ type = "pdf"; url = $p.pdf })
    highlights = @(
      @{ highlightId = "h1"; page = 1; level = "claim"; title = "Problem"; snippet = $k1 },
      @{ highlightId = "h2"; page = 1; level = "evidence"; title = "Findings"; snippet = $k2 }
    )
    tags = @("paper", [string]$p.domain, [string]$p.region, "bilingual", "batch")
    publishedAt = $pub
  } | ConvertTo-Json -Depth 10
  try {
    Ingest -base $BaseUrl -token $token -demo $DemoToken -rid "$ridBase-$idx" -jsonBody $body | Out-Null
    $ok += @{ idx = $idx; postId = $postId; title = $title; domain = $p.domain; pdf = $p.pdf }
    Write-Host ("OK {0}/{1} {2}" -f $idx, $sel.Count, $title)
  } catch {
    $fail += @{ idx = $idx; title = $title; error = $_.Exception.Message }
    Write-Host ("FAIL {0}/{1} {2}" -f $idx, $sel.Count, $title)
  }
  Start-Sleep -Milliseconds 200
}

Write-Host ("STEP 4 done ok={0} fail={1}" -f $ok.Count, $fail.Count)
$outDir = Join-Path (Get-Location) "paperflow\scripts\out"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$okFile = Join-Path $outDir ("batch-ok-" + $ts + ".csv")
$failFile = Join-Path $outDir ("batch-fail-" + $ts + ".csv")
$ok | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $okFile
$fail | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $failFile
Write-Host ("STEP 5 output: " + $okFile)
Write-Host ("STEP 5 output: " + $failFile)
