# FiveAgentWorkflow 核心工作流详解

## 1. 背景与目标

### 与前序模块的关系
本模块是 Python Agent 的核心智能工作流，基于 LangGraph 实现，为前端 Pathfinder 功能提供支持。

### 为什么要做这个
为用户提供自动化的论文检索、筛选、摘要和学习路径规划功能，降低论文阅读门槛。

### 功能目标
- Scout：从 arXiv 和本地语料召回候选论文
- Curator：审核筛选，去重和主题屏蔽
- Editor：生成摘要、标签和知识卡片
- Sage：基于已有知识问答
- Pathfinder：生成分阶段学习计划

---

## 2. 架构与流程设计

### 整体流程
```
用户请求 → Route Start → [Pathfinder →] Scout → Curator → Editor → [Sage →] [Pathfinder →] Finalize
```

### 关键决策点
| 问题 | 决策 | 理由 |
|------|------|------|
| 状态管理 | LangGraph + FileCheckpointStore | 支持断点续传和状态持久化 |
| 路由 | 条件边路由 | 根据当前状态自动决定下一个节点 |
| 检索源 | arXiv + 本地语料双路召回 | 兼顾时效性和个性化 |

---

## 3. 核心代码详解

### 3.1 FiveAgentWorkflow 整体定义
**文件位置**：[app/agents/workflow.py](file:///f:/Gitee/PaperFlow/PaperFlow/app/agents/workflow.py)

```python
class FiveAgentWorkflow:
    def __init__(self, uploads_dir: Path, checkpoint_store: FileCheckpointStore, db_service: Any | None = None) -> None:
        self.checkpoints = checkpoint_store
        self.memory = InMemorySaver()
        self.db_service = db_service
        self.scout = ScoutAgent(LocalPaperCorpus(uploads_dir), ArxivClient())
        self.curator = CuratorAgent()
        self.editor = EditorAgent()
        self.sage = SageAgent()
        self.pathfinder = PathfinderAgent()
        self.graph = self._build_graph()

    def _build_graph(self):
        builder = StateGraph(GraphState)
        builder.add_node("route_start", self._route_start_node)
        builder.add_node("pathfinder", self._pathfinder_node)
        builder.add_node("scout", self._scout_node)
        builder.add_node("curator", self._curator_node)
        builder.add_node("editor", self._editor_node)
        builder.add_node("sage", self._sage_node)
        builder.add_node("finalize", self._finalize_node)

        builder.add_edge(START, "route_start")
        builder.add_conditional_edges(
            "route_start",
            self._route_from_start,
            {"pathfinder": "pathfinder", "scout": "scout", "curator": "curator", "sage": "sage"},
        )
        # ... 更多条件边
        return builder.compile(checkpointer=self.memory)
```

### 3.2 ScoutAgent 论文召回
```python
class ScoutAgent:
    async def run(self, state: WorkflowState) -> None:
        queries = state.search_queries or self._build_queries(state)
        state.search_queries = queries

        pool = [paper.model_copy(deep=True) for paper in state.candidate_pool]
        if not pool:
            try:
                pool = await self.arxiv_client.search(queries, limit=max(state.requested_count * 3, 12))
                if pool:
                    state.messages.append(f"Scout 已从 arXiv 拉取 {len(pool)} 篇候选。")
            except Exception as exc:
                state.messages.append(f"Scout 访问 arXiv 失败，已回退本地语料: {exc}")
                pool = []
        if not pool:
            pool = self.corpus.search(queries, limit=max(state.requested_count * 3, 12))
```

### 3.3 CuratorAgent 论文审核
```python
class CuratorAgent:
    async def run(self, state: WorkflowState) -> None:
        approved: list[CandidatePaper] = [paper.model_copy(deep=True) for paper in state.approved]
        rejected: list[CandidatePaper] = [paper.model_copy(deep=True) for paper in state.rejected]
        library = state.existing_library + approved

        for paper in state.candidates:
            # 去重
            duplicate = self._find_duplicate(review, library)
            if duplicate:
                review.duplicate_of = duplicate.paper_id
                rejected.append(review)
                continue

            # 相关性阈值
            if review.relevance_score < 0.15:
                review.notes.append("与当前目标关联度过低")
                rejected.append(review)
                continue

            approved.append(review)
```

---

## 4. 接口契约

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/agents/workflow | POST | 触发五智能体工作流 |
| /api/agents/runs/{run_id} | GET | 获取工作流运行状态 |
| /api/agents/sage/pdf-qa | POST | PDF 问答 |

---

## 5. 边界与约束
- arXiv API 有请求频率限制，单次查询不超过 3 个关键词
- 本地语料只支持 PDF 文件
- 最大召回 12 篇候选论文

---

## 6. 常见问题与踩坑经验
- **问题**：LangGraph 条件路由在状态更新后不生效
  - **解决**：确保在每个节点结束时调用 _checkpoint 保存状态
- **问题**：Scout 本地语料检索太慢
  - **解决**：按文件修改时间倒序，只检索最新文件

---

## 7. 可演进方向
- 接入更多论文源（IEEE Xplore, PubMed）
- 加入 LLM 驱动的摘要生成
- 支持自定义 Curator 审核规则

---

## 8. 小结
FiveAgentWorkflow 是 Python Agent 的核心，通过五个智能体的流水线协作，实现了从论文召回到学习路径规划的完整闭环。

---

## 9. 页内导航

- 所属模块：[Python Agent 模块索引](./00-index.md)
- 上一篇：当前已是本模块第一篇，建议先回看 [模块索引](./00-index.md)
- 下一篇：[PDF 解析与划词翻译详解](./02-pdf-parsing-and-translation.md)
- 关联阅读：
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [Deploy 模块索引](../deploy/00-index.md)
