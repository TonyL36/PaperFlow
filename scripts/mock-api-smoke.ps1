param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "http://localhost:3151"
)

$headers = @{
  "Accept" = "application/json"
  "Content-Type" = "application/json"
  "X-Request-Id" = [Guid]::NewGuid().ToString()
}

Write-Host "1) List posts"
$posts = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/v1/posts?page[number]=1&page[size]=5" -Headers $headers
$firstPostId = $posts.data.items[0].postId
Write-Host "   firstPostId=$firstPostId"

Write-Host "2) Login as admin"
$loginBody = @{ email = "admin@example.com"; password = "admin12345" } | ConvertTo-Json
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" -Headers $headers -Body $loginBody -SessionVariable sess
$token = $login.data.accessToken
Write-Host "   token acquired"

Write-Host "3) Create comment (PENDING)"
$headers2 = $headers.Clone()
$headers2["Authorization"] = "Bearer $token"
$commentBody = @{ postId = $firstPostId; content = "这是一条用于冒烟测试的评论，将进入待审核。" } | ConvertTo-Json
$created = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/comments" -Headers $headers2 -Body $commentBody -WebSession $sess
$cid = $created.data.commentId
Write-Host "   commentId=$cid"

Write-Host "4) Approve comment"
$approveBody = @{ status = "APPROVED" } | ConvertTo-Json
Invoke-RestMethod -Method PATCH -Uri "$BaseUrl/api/v1/admin/comments/$cid" -Headers $headers2 -Body $approveBody -WebSession $sess | Out-Null
Write-Host "   approved"

Write-Host "5) List approved comments"
$approved = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/v1/comments?postId=$firstPostId&page[number]=1&page[size]=5" -Headers $headers -WebSession $sess
$count = $approved.data.items.Count
Write-Host "   approvedCount=$count"
