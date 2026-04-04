# 28 论文阅读页：Agent 传输协议与高亮规范

## 目标

- 支持论文 Agent 推送 PDF/HTML/Markdown 等多格式资源
- 支持重点高亮语义化展示，并可进入 AI 对话“添加/翻译”
- 保证前端可稳定渲染，且对话上下文可追溯到原文片段

## 布局规范

- 页面采用 `1:3:1` 三栏布局：
  - 左栏（1）：缩略图、资源类型、语义高亮与操作
  - 中栏（3）：文档阅读主视图 + 正文节选
  - 右栏（1）：Kimi 插件风格 AI 侧边栏
- 目标是“高信息密度+低留白”，优先占满可用横向空间

## 高亮语义颜色规范

- `claim` 核心结论：黄色（强调最终判断）
- `evidence` 关键证据：蓝色（强调数据/实验支撑）
- `method` 方法与步骤：绿色（强调流程与实现）
- `risk` 风险与局限：红色（强调边界与不确定性）

## Agent 论文传输 API 规范（建议）

### 1) 创建/更新论文资源

- `POST /api/v1/papers/ingest`
- Body（示例）：

```json
{
  "postId": "post_xxx",
  "paperId": "paper_xxx",
  "title": "Paper Title",
  "formats": [
    { "type": "pdf", "url": "https://.../paper.pdf", "sha256": "..." },
    { "type": "html", "url": "https://.../paper.html" },
    { "type": "markdown", "url": "https://.../paper.md" }
  ],
  "defaultFormat": "pdf",
  "highlights": [
    {
      "highlightId": "h_1",
      "level": "claim",
      "title": "核心结论",
      "snippet": "....",
      "anchor": { "format": "pdf", "page": 3, "bbox": [0.12, 0.36, 0.74, 0.41] }
    }
  ],
  "agentMeta": {
    "agentName": "paper-agent",
    "version": "1.0.0",
    "generatedAt": "2026-03-26T10:20:30Z"
  }
}
```

### 2) 查询论文资源

- `GET /api/v1/papers/{paperId}`
- 返回资源格式列表、默认格式、高亮列表、agent 元数据

### 3) 查询高亮

- `GET /api/v1/papers/{paperId}/highlights?level=claim&page=3`
- 用于分页加载与筛选

## PDF 高亮指令规范（传输信息）

- 高亮锚点使用统一结构：
  - `format`: `pdf|html|markdown`
  - `page`: PDF 页码（从 1 开始）
  - `bbox`: 相对坐标 `[x1,y1,x2,y2]`，范围 `0~1`
  - `quote`: 可选，防漂移校验文本
  - `selector`: HTML/Markdown 可选定位器（XPath/CSS/Range）

示例：

```json
{
  "highlightId": "h_42",
  "level": "evidence",
  "snippet": "The model outperforms baseline by 12.4%.",
  "anchor": {
    "format": "pdf",
    "page": 5,
    "bbox": [0.13, 0.49, 0.78, 0.54],
    "quote": "outperforms baseline by 12.4%"
  }
}
```

## 前端对话行为规范

- 左栏高亮支持两个动作：
  - 添加到对话：加入 `references`，用户可再输入问题发送
  - 翻译：直接触发翻译对话并附带原文引用
- 对话渲染规范：
  - AI 头像左侧，用户头像右侧
  - 气泡对话样式，逐字输出 AI 回复
  - 每条消息可挂载引用 chips，保留可追溯上下文

## 兼容与降级

- PDF 内嵌失败时提供“打开原始文件”降级入口
- 仅有 PDF 时仍可工作；HTML/Markdown 为增强能力
- 高亮缺失时页面保留基础阅读与 AI 问答能力
