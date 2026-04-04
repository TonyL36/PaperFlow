param(
  [string]$BaseUrl = "http://47.109.193.180:9628",
  [string]$DemoToken = "demo-token",
  [string]$Email = "alice@example.com",
  [string]$Password = "password123",
  [int]$MaxCount = 5,
  [switch]$SkipArxivFetch
)

$ErrorActionPreference = "Stop"
$rid = "rid-med-agent-" + [DateTimeOffset]::Now.ToUnixTimeSeconds()
Write-Host "STEP 1/4 login and get token..."
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "login failed or account disabled"
}

$arxivIds = @(
  "1901.08746",
  "2007.15779",
  "2203.03540",
  "2005.12833",
  "1904.05342",
  "2301.11525",
  "2310.04513"
)

function Normalize-Text([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ""
  }
  return ($text -replace "\s+", " ").Trim()
}

function Get-ArxivEntries([string[]]$ids) {
  $idList = ($ids -join ",")
  $url = "https://export.arxiv.org/api/query?id_list=$idList"
  $xmlRaw = $null
  $headers = @{ "User-Agent" = "PaperFlow-MedicalIngest/1.0 (contact: local-dev)" }
  for ($i = 0; $i -lt 3; $i++) {
    try {
      Write-Host "STEP 2/4 fetch arXiv metadata...attempt $($i + 1)/3"
      $resp = Invoke-WebRequest -Method GET -Uri $url -Headers $headers -TimeoutSec 30
      $xmlRaw = $resp.Content
      break
    } catch {
      Start-Sleep -Seconds (2 + $i * 2)
    }
  }
  if ([string]::IsNullOrWhiteSpace($xmlRaw)) {
    return @()
  }
  [xml]$doc = $xmlRaw
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
        $pdf = $lnk.href
      }
    }
    if ([string]::IsNullOrWhiteSpace($pdf) -and $idText -match "arxiv\.org/abs/([0-9]+\.[0-9]+)") {
      $pdf = "https://arxiv.org/pdf/$($Matches[1]).pdf"
    }
    if (-not [string]::IsNullOrWhiteSpace($title) -and -not [string]::IsNullOrWhiteSpace($pdf)) {
      $result += @{
        title = $title
        pdf = $pdf
        summary = $summary
        published = $published
      }
    }
  }
  return $result
}

function Invoke-AgentIngest($payload) {
  try {
    return Invoke-RestMethod -Method POST `
      -Uri "$BaseUrl/api/v1/internal/agent/papers" `
      -Headers @{ "X-Request-Id" = $rid; "X-Demo-Ingest-Token" = $DemoToken; "Authorization" = "Bearer $token" } `
      -ContentType "application/json" `
      -Body $payload `
      -ErrorAction Stop
  } catch {
    $resp = $_.ErrorDetails.Message
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    if (($resp -and $resp -like "*Endpoint not enabled*") -or $statusCode -eq 404) {
      return Invoke-RestMethod -Method POST `
        -Uri "$BaseUrl/api/v1/papers/ingest" `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -ContentType "application/json" `
        -Body $payload `
        -ErrorAction Stop
    }
    throw
  }
}

$papers = @()
if (-not $SkipArxivFetch) {
  $papers = @(Get-ArxivEntries -ids $arxivIds | Select-Object -First $MaxCount)
}
if (-not $papers -or $papers.Count -eq 0) {
  Write-Host "STEP 2/4 use built-in real paper list (skip external fetch)"
  $papers = @((
    @{
      title = "BioBERT: a pre-trained biomedical language representation model for biomedical text mining"
      pdf = "https://arxiv.org/pdf/1901.08746.pdf"
      summary = "BioBERT is pre-trained on large-scale biomedical corpora and improves biomedical NER, relation extraction, and QA."
      published = "2019-01-25T00:00:00Z"
    },
    @{
      title = "Domain-Specific Language Model Pretraining for Biomedical Natural Language Processing"
      pdf = "https://arxiv.org/pdf/2007.15779.pdf"
      summary = "PubMedBERT demonstrates that in-domain pretraining from scratch can outperform continual pretraining for biomedical NLP."
      published = "2020-07-30T00:00:00Z"
    },
    @{
      title = "GatorTron: A Large Clinical Language Model to Unlock Patient Information from Electronic Health Records"
      pdf = "https://arxiv.org/pdf/2203.03540.pdf"
      summary = "GatorTron is trained on large clinical corpora and improves multiple clinical NLP benchmarks."
      published = "2022-03-07T00:00:00Z"
    },
    @{
      title = "Med-BERT: pretrained contextualized embeddings on large-scale structured electronic health records for disease prediction"
      pdf = "https://arxiv.org/pdf/2005.12833.pdf"
      summary = "Med-BERT adapts pretraining to structured EHR sequences and improves disease prediction tasks."
      published = "2020-05-26T00:00:00Z"
    },
    @{
      title = "Publicly Available Clinical BERT Embeddings"
      pdf = "https://arxiv.org/pdf/1904.03323.pdf"
      summary = "Clinical-domain BERT variants provide stronger representations for downstream clinical NLP tasks."
      published = "2019-04-05T00:00:00Z"
    }
  ) | Select-Object -First $MaxCount)
}

foreach ($p in $papers) {
  $paperTitle = [string]$p.title
  Write-Host ("STEP 3/4 ingest paper: {0}" -f $paperTitle)
  $postId = "post_med_" + [Guid]::NewGuid().ToString("N")
  $paperId = "paper_med_" + [Guid]::NewGuid().ToString("N")
  $publishedAt = if ([string]::IsNullOrWhiteSpace($p.published)) { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } else { $p.published }
  $summary = if ([string]::IsNullOrWhiteSpace($p.summary)) { "Medical-informatics paper metadata for pipeline test." } else { $p.summary }
  $evidence = if ($summary.Length -gt 140) { $summary.Substring(0, 140) + "..." } else { $summary }
  $safeTitle = $p.title
  if ($safeTitle.Length -gt 80) {
    $safeTitle = $safeTitle.Substring(0, 80)
  }
  $body = @{
    postId = $postId
    title = $safeTitle
    source = "agent-medical"
    content = "# Summary`n$summary`n`n## Key Evidence`n- $evidence`n`n## Test Note`n- Imported from real arXiv metadata for medical-informatics pipeline validation."
    paperId = $paperId
    formats = @(@{ type = "pdf"; url = $p.pdf })
    highlights = @(
      @{ highlightId = "h1"; page = 1; level = "claim"; title = "Core Claim"; snippet = $summary },
      @{ highlightId = "h2"; page = 1; level = "evidence"; title = "Key Evidence"; snippet = $evidence }
    )
    tags = @("paper", "medical-informatics", "arxiv", "agent-test")
    publishedAt = $publishedAt
  } | ConvertTo-Json -Depth 8

  $res = Invoke-AgentIngest -payload $body

  "OK $postId $safeTitle"
}
Write-Host "STEP 4/4 DONE: imported $(@($papers).Count) papers"
