param(
  [string]$OutPath = "F:\Gitee\PaperFlow\PaperFlow\scripts\data\multi-domain-arxiv-seed.json",
  [int]$PerDomain = 3
)

$ErrorActionPreference = "Stop"

function Norm([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "" }
  return ($s -replace "\s+", " ").Trim()
}

function FetchArxiv([string]$query, [int]$maxResults) {
  $enc = [uri]::EscapeDataString($query)
  $url = "https://export.arxiv.org/api/query?search_query=$enc&start=0&max_results=$maxResults&sortBy=submittedDate&sortOrder=descending"
  $resp = Invoke-WebRequest -Method GET -Uri $url -Headers @{ "User-Agent" = "PaperFlow-MultiSeed/1.0" } -TimeoutSec 45 -UseBasicParsing
  [xml]$doc = $resp.Content
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace("a", "http://www.w3.org/2005/Atom")
  $entries = $doc.SelectNodes("//a:entry", $ns)
  $out = @()
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
    if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($summary) -or [string]::IsNullOrWhiteSpace($pdf)) { continue }
    if ($pdf -notmatch "^https://arxiv\.org/pdf/") { continue }
    $out += [pscustomobject]@{
      sourceId = $idText
      title = $title
      summary = $summary
      publishedAt = $published
      pdfUrl = $pdf
    }
  }
  return $out
}

$defs = @(
  @{ domain = "medical"; q = 'cat:cs.CL AND (all:biomedical OR all:clinical OR all:medical OR all:healthcare)' },
  @{ domain = "cyber"; q = 'cat:cs.CR AND (all:security OR all:vulnerability OR all:malware OR all:intrusion)' },
  @{ domain = "coding"; q = '(cat:cs.SE OR cat:cs.AI) AND (all:"code generation" OR all:"coding agent" OR all:"software engineering")' },
  @{ domain = "game"; q = '(cat:cs.AI OR cat:cs.LG) AND (all:game OR all:gameplay OR all:"procedural generation")' }
)

$picked = @()
$seen = @{}
foreach ($d in $defs) {
  Start-Sleep -Seconds 2
  $rows = FetchArxiv -query $d.q -maxResults 18
  $take = 0
  foreach ($r in $rows) {
    $k = [string]$r.sourceId
    if ($seen.ContainsKey($k)) { continue }
    $seen[$k] = $true
    $picked += $r
    $take++
    if ($take -ge $PerDomain) { break }
  }
}

$json = $picked | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutPath, $json, [System.Text.UTF8Encoding]::new($true))
Write-Host ("seed_count=" + $picked.Count)
Write-Host ("seed_file=" + $OutPath)
