# Python Agent 模块索引

## 1. 模块定位

Python Agent 是 PaperFlow 的 AI 能力层，负责把论文解析、划词翻译、PDF 问答、五 Agent 工作流和学习路径规划这类能力补到系统里。它不直接替代前端或内容服务，而是作为中间智能层向它们提供能力。

从阅读顺序上看，它更适合放在前端和内容服务之后阅读，因为这时你已经知道：
- 前端到底想要什么样的 AI 交互
- 内容服务和数据库最终承接哪些结果

---

## 2. 子文档清单

| 编号 | 文档 | 核心内容 |
|------|------|----------|
| 01 | [FiveAgentWorkflow 核心工作流](./01-five-agent-workflow.md) | Scout、Curator、Editor、Sage、Pathfinder 的路由与协作 |
| 02 | [PDF 解析与划词翻译](./02-pdf-parsing-and-translation.md) | PDF 上传、MinerU 解析、块匹配与翻译流程 |
| 03 | [与后端的集成方式](./03-backend-integration.md) | Agent 结果如何存库，如何与 Content Service 配合 |

---

## 3. 阅读顺序建议

推荐按下面顺序阅读：

1. 先看 [02-pdf-parsing-and-translation.md](./02-pdf-parsing-and-translation.md)
   - 这篇最接近用户可感知的 AI 阅读功能，读起来更直观

2. 再看 [01-five-agent-workflow.md](./01-five-agent-workflow.md)
   - 当你知道输入输出长什么样后，再看工作流编排会更容易理解

3. 最后看 [03-backend-integration.md](./03-backend-integration.md)
   - 这篇负责把前两篇能力真正接回数据库和业务系统

---

## 4. 交叉引用

### 前置阅读
- [前端索引](../frontend/00-index.md)
  - 推荐先读 [AI 阅读与 Pathfinder](../frontend/03-ai-reading-pathfinder.md)
- [内容服务索引](../content-service/00-index.md)
  - 推荐先对内容域接口和数据结构有基本认识

### 强关联模块
- [部署索引](../deploy/00-index.md)
  - 如果你关心 Python Agent 相关数据库、环境变量和运行落地，可以继续看部署模块
- [模块总索引](../00-index.md)
  - 如果你想切回全局视角，可以回总索引继续按主线阅读

### 下一步推荐
- 想继续看“AI 能力最终怎么上环境”：去看 [部署索引](../deploy/00-index.md)
- 想回头对照页面交互：去看 [前端索引](../frontend/00-index.md)
