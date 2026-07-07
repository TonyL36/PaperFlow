# Python Agent 与后端集成详解

## 1. 背景与目标

### 与前序模块的关系
本模块是 Python Agent 与 Content Service 之间的桥梁，负责数据持久化和接口对接。

### 为什么要做这个
将 AI 能力与后端业务系统连接，实现数据持久化和用户会话管理。

### 功能目标
- Agent 运行状态持久化
- 解析结果存库
- 通过 Content Service 内部接口推送论文

---

## 2. 架构与流程设计

### 整体流程
```
Python Agent → PaperflowDbService → PostgreSQL → Content Service
```

### 关键决策点
| 问题 | 决策 | 理由 |
|------|------|------|
| 数据库访问 | 异步 asyncpg | 提高并发性能 |
| 表结构 | 沿用 Content Service 迁移 | 统一 schema 管理 |
| 论文推送 | Content Service 内部接口 | 复用现有鉴权和幂等机制 |

---

## 3. 核心代码详解

### 3.1 PaperflowDbService
**文件位置**：[app/services/paperflow_db.py](file:///f:/Gitee/PaperFlow/PaperFlow/app/services/paperflow_db.py)

```python
class PaperflowDbService:
    def __init__(self, config: PaperflowDbConfig) -> None:
        self.config = config

    async def upsert_upload_task(self, task_id: str, filename: str, upload_path: str, source: str) -> None:
        # 插入或更新上传任务
        pass

    async def save_parsed_paper(self, task_id: str, filename: str, upload_path: str, blocks: list[dict[str, Any]], raw_data: dict[str, Any], parse_meta: dict[str, Any]) -> None:
        # 保存解析结果
        pass

    async def upsert_agent_run(...) -> None:
        # 保存 Agent 运行记录
        pass

    async def upsert_agent_outputs(...) -> None:
        # 保存 Agent 输出
        pass
```

### 3.2 通过 Content Service 推送论文
参考 by-feature 文档：[14-content-agent-ingest.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/14-content-agent-ingest.md)

```python
# 伪代码：推送论文到 Content Service
async def push_paper_to_content_service(paper: CandidatePaper, token: str) -> None:
    url = "http://content-service:8082/api/v1/internal/agent/posts"
    headers = {"X-Demo-Ingest-Token": token}
    payload = {
        "postId": paper.paper_id,
        "title": paper.title,
        "content": paper.summary or paper.abstract,
        "source": "python-agent",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
```

---

## 4. 接口契约
参考 Content Service 内部接口文档。

---

## 5. 边界与约束
- 数据库连接超时 10 秒
- 推送论文最大重试 3 次
- 解析结果 JSON 最大 10MB

---

## 6. 常见问题与踩坑经验
- **问题**：Content Service 内部接口返回 404
  - **解决**：检查 `paperflow.demo-ingest.enabled` 配置是否为 true
- **问题**：数据库连接池耗尽
  - **解决**：使用连接池并限制最大连接数

---

## 7. 可演进方向
- 增加消息队列解耦
- 支持增量更新
- 增加数据导出功能

---

## 8. 小结
Python Agent 通过 PaperflowDbService 与后端集成，实现了数据持久化和业务对接。

---

## 9. 页内导航

- 所属模块：[Python Agent 模块索引](./00-index.md)
- 上一篇：[PDF 解析与划词翻译详解](./02-pdf-parsing-and-translation.md)
- 下一篇：当前已是本模块最后一篇，建议回看 [模块索引](./00-index.md) 或继续阅读 [总览导航文档](../01-navigation-guide.md)
- 关联阅读：
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [Deploy 模块索引](../deploy/00-index.md)
