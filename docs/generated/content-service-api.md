# PaperFlow Content Service API

- API Version: v1
- Generated At: 2026-03-16T21:28:09.3426308+08:00

## Endpoints

| Method | Path | Controller#Method |
|---|---|---|
| GET | /api/v1/admin/comments | AdminController#listComments |
| PATCH | /api/v1/admin/comments/{commentId} | AdminController#updateCommentStatus |
| GET | /api/v1/comments | CommentsController#list |
| POST | /api/v1/comments | CommentsController#create |
| POST | /api/v1/internal/agent/posts | AgentIngestController#ingestPost |
| GET | /api/v1/posts | PostsController#list |
| GET | /api/v1/posts/{postId} | PostsController#get |

## AdminController

### GET /api/v1/admin/comments

- Handler: AdminController#listComments
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Roles | `String` | false |
| query | status | `String` | false |
| query | page[number] | `int` | false |
| query | page[size] | `int` | false |

### PATCH /api/v1/admin/comments/{commentId}

- Handler: AdminController#updateCommentStatus
- Request Body: `UpdateCommentStatusRequest`
- Response: `Envelope<CommentResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Roles | `String` | false |
| path | commentId | `String` | true |

## CommentsController

### GET /api/v1/comments

- Handler: CommentsController#list
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| query | postId | `String` | true |
| query | page[number] | `int` | false |
| query | page[size] | `int` | false |

### POST /api/v1/comments

- Handler: CommentsController#create
- Request Body: `CreateCommentRequest`
- Response: `Envelope<CommentResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

## AgentIngestController

### POST /api/v1/internal/agent/posts

- Handler: AgentIngestController#ingestPost
- Request Body: `IngestPostRequest`
- Response: `Envelope<PostResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-Demo-Ingest-Token | `String` | false |

## PostsController

### GET /api/v1/posts

- Handler: PostsController#list
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| query | page[number] | `int` | false |
| query | page[size] | `int` | false |

### GET /api/v1/posts/{postId}

- Handler: PostsController#get
- Response: `Envelope<PostResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| path | postId | `String` | true |

