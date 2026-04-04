param(
  [string]$BaseUrl = "http://localhost:3151",
  [string]$DemoToken = "demo-token"
)

$rid = "rid-paper-ingest-" + [DateTimeOffset]::Now.ToUnixTimeSeconds()
$postId = "post_paper_ingest_" + [DateTimeOffset]::Now.ToUnixTimeSeconds()
$login = Invoke-RestMethod -Method POST `
  -Uri "$BaseUrl/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}'
$token = $login.data.accessToken
$body = @{
  postId = $postId
  title = "Agent Paper Highlight Ingest Test"
  source = "agent-demo"
  content = "# Summary`nThis paper proposes an architecture based only on attention."
  paperId = "paper_demo_" + [DateTimeOffset]::Now.ToUnixTimeSeconds()
  formats = @(
    @{ type = "pdf"; url = "https://arxiv.org/pdf/1706.03762.pdf" }
  )
  highlights = @(
    @{ highlightId = "h1"; page = 1; level = "claim"; title = "Core Claim"; snippet = "Transformer relies only on attention and removes recurrence and convolution." },
    @{ highlightId = "h2"; page = 2; level = "evidence"; title = "Evidence"; snippet = "It reaches 28.4 BLEU on WMT14 English-to-German translation." }
  )
  tags = @("paper", "transformer")
  publishedAt = "2026-03-27T12:00:00Z"
} | ConvertTo-Json -Depth 8

try {
  $res = Invoke-RestMethod -Method POST `
    -Uri "$BaseUrl/api/v1/internal/agent/papers" `
    -Headers @{ "X-Request-Id" = $rid; "X-Demo-Ingest-Token" = $DemoToken; "Authorization" = "Bearer $token" } `
    -ContentType "application/json" `
    -Body $body
  Write-Host "STATUS=201"
  Write-Host ($res | ConvertTo-Json -Depth 8)
} catch {
  Write-Host "STATUS=ERROR"
  throw
}

try {
  $detail = Invoke-RestMethod -Method GET `
    -Uri "$BaseUrl/api/v1/posts/$postId" `
    -Headers @{ "X-Request-Id" = ($rid + "-get") }
  Write-Host "DETAIL_STATUS=200"
  Write-Host ($detail | ConvertTo-Json -Depth 8)
} catch {
  Write-Host "DETAIL_STATUS=ERROR"
  throw
}
