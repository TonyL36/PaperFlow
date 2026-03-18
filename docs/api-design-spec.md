# PaperFlow《API 设计规范》（v1）

本文档定义 PaperFlow 对外 HTTP API 的统一设计规范，适用于：React SPA、统一 API 网关、用户管理服务，以及后续独立迭代的 Agent 服务（由网关转发）。

## 1. 总体原则

- 面向资源（Resource-Oriented），使用名词而非动词
- 统一网关出入口：所有对外请求进入网关，由网关完成鉴权、限流、错误归一化、版本管理
- 向后兼容优先：新增字段允许，改名/删字段仅允许在新主版本
- 可观测性默认开启：requestId 全链路贯穿（前端可自带，缺省网关生成）

## 2. URL 与命名

### 2.1 基础路径

- `/{apiPrefix}`：`/api/v1`
- 资源路径：`/api/v1/{resources}/{id}`

示例：

- `/api/v1/users/me`
- `/api/v1/users/u_123`
- `/api/v1/papers/p_987`

### 2.2 命名规则

- Path Segment：kebab-case（如 `learning-paths`）
- 资源集合：复数（`users`、`papers`、`learning-paths`）
- 标识符：对外稳定字符串（如 `u_123`、`p_987`），不暴露自增主键
- Query 参数：camelCase（如 `include=roles`、`sort=-createdAt`）

### 2.3 动作型接口的处理

优先使用状态迁移或子资源表达动作：

- 登录：`POST /auth/login`（认证属于会话子域）
- 刷新：`POST /auth/refresh`
- 注销：`POST /auth/logout`

对无法自然建模为资源的动作，允许采用子路径动词，但必须满足：

- 动作只影响单一资源或单一聚合根
- HTTP Method 与语义一致（触发类用 POST）

## 3. HTTP Method 语义

- `GET`：查询资源/集合（幂等）
- `POST`：创建资源/触发动作（非幂等；建议支持幂等键）
- `PUT`：全量替换（幂等）
- `PATCH`：部分更新（幂等；需定义可更新字段）
- `DELETE`：删除（幂等）

## 4. 请求与响应格式

### 4.1 统一响应 Envelope

- 成功：`{ requestId, data, links }`
- 失败：`{ requestId, error: { code, message, details } }`

`requestId` 必须存在，便于排障与审计。

### 4.2 Content-Type

- 请求：`application/json`
- 返回：`application/json`
- 文件上传：`multipart/form-data`（如 PDF 上传；由网关转发下游服务）

## 5. 分页（Pagination）

集合查询必须支持分页，默认分页，禁止返回无界列表。

### 5.1 参数定义

- `page[number]`：从 1 开始，默认 1
- `page[size]`：每页条数，默认 20，最大 200

示例：

`GET /api/v1/papers?page[number]=2&page[size]=50`

### 5.2 响应结构

```json
{
  "requestId": "…",
  "data": {
    "items": [],
    "page": {
      "number": 2,
      "size": 50,
      "totalItems": 1234,
      "totalPages": 25
    }
  },
  "links": [
    { "rel": "self", "href": "/api/v1/papers?page[number]=2&page[size]=50" },
    { "rel": "next", "href": "/api/v1/papers?page[number]=3&page[size]=50" }
  ]
}
```

## 6. 过滤（Filtering）

采用 `filter[field]=value` 形式；复杂过滤使用 `filter[field][op]=value`。

支持的 `op`（建议最小集合）：

- `eq`、`ne`
- `gt`、`gte`、`lt`、`lte`
- `like`（模糊匹配，服务端定义转义规则）
- `in`（逗号分隔）

示例：

- `GET /api/v1/papers?filter[year][gte]=2022`
- `GET /api/v1/papers?filter[keywords][in]=mamba,ssm`
- `GET /api/v1/users?filter[email][like]=@example.com`

规则：

- 未声明支持的 filter 字段必须返回 `400 REQ_VALIDATION_FAILED`
- `like` 只允许对明确标注为可搜索字段启用

## 7. 排序（Sorting）

使用 `sort=field1,-field2`：

- 升序：`sort=createdAt`
- 降序：`sort=-createdAt`

示例：

`GET /api/v1/papers?sort=-publishedAt,createdAt`

规则：

- 未支持字段必须返回 `400 REQ_VALIDATION_FAILED`
- 默认排序必须在文档中说明（如 `-createdAt`）

## 8. 字段选择与展开（Sparse Fieldsets / Include）

用于优化 SPA 带宽与首屏性能。

- `fields[resource]=a,b,c`
- `include=rel1,rel2`

示例：

`GET /api/v1/users/me?fields[user]=userId,displayName&include=roles`

规则：

- `fields[...]` 只影响 `data` 的字段，不影响 `links`
- `include` 仅允许预定义关系，禁止任意 join

## 9. HATEOAS 约束（links）

### 9.1 link 模型

```json
{
  "rel": "self",
  "href": "/api/v1/users/me",
  "method": "GET",
  "type": "application/json"
}
```

规范：

- `rel`：使用 IANA 关系名或团队约定名（`self`、`next`、`prev`、`update`、`delete`）
- `href`：必须是相对路径（便于多环境切换）
- `method`：可选，建议在可操作链接中提供

### 9.2 约束规则

- 所有单资源响应必须提供 `self`
- 集合响应必须提供 `self`，如有下一页提供 `next`
- 需要权限控制的操作链接：
  - 如果当前用户无权限，则不返回该 link（而不是返回一个会 403 的 link）

## 10. 错误处理与校验

### 10.1 校验失败

- 统一错误码：`REQ_VALIDATION_FAILED`
- `details` 建议包含字段级错误数组（不包含敏感值）

```json
{
  "requestId": "…",
  "error": {
    "code": "REQ_VALIDATION_FAILED",
    "message": "Validation failed",
    "details": {
      "fields": [
        { "field": "email", "reason": "invalid_format" }
      ]
    }
  }
}
```

### 10.2 错误码稳定性

- `code` 为稳定契约，前端逻辑依据 `code` 分支
- `message` 允许调整表达，不作为逻辑判断依据

## 11. 幂等与并发控制

- 幂等键：`Idempotency-Key`（见端到端流程文档）
- 乐观锁（可选）：对可并发编辑资源使用 `ETag` / `If-Match`

## 12. 安全与隐私

- 禁止在日志/审计中记录 `Authorization`、密码、refresh token、完整请求体（对包含敏感字段的接口需脱敏）
- CORS：仅允许 SPA 域名；开发环境可放开但必须通过环境配置
- CSRF：若 refresh 使用 cookie，刷新接口需进行 CSRF 防护（推荐 SameSite + 双提交 token 或仅同站点调用）

## 13. 文档规范与生成

- 接口文档必须来源于代码（Controller 注解）生成，避免手写与实现漂移
- 每次构建生成：
  - `docs/generated/api-v1.md`
  - 上传到文档仓库/对象存储（由构建插件完成）

