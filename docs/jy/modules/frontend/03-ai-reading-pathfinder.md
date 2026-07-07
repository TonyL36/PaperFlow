# 前端 AI 阅读与 Pathfinder 详解

## 1. 背景与目标

### 与前序模块的关系
本模块基于前端阅读体验，进一步集成 AI 能力，包括 Pathfinder 学习路径规划、论文 PDF 阅读和 AI 对话助手。

### 为什么要做这个
- 提供 AI 辅助的论文阅读体验
- Pathfinder 学习路径规划，帮助用户系统性学习
- 选中内容添加到对话或翻译，提升阅读效率

### 功能目标
1. Pathfinder 学习路径规划与会话管理
2. 论文 PDF 阅读与 AI 对话
3. 选中内容添加到对话或翻译
4. AI 对话历史持久化到后端

---

## 2. 架构与流程设计

### 整体流程
```
用户输入学习目标 → 调用 apiGeneratePathfinderPlan → 展示学习路径 → 用户标记阅读项完成 → 自动更新进度 → 调用 persistSession 保存到后端
```

### 关键决策点
| 问题 | 决策 | 理由 |
|------|------|------|
| 会话存储 | localStorage + 后端持久化 | 兼顾离线可用与数据同步 |
| 阶段状态管理 | recalculateStageStatus 自动计算 | 简化用户操作 |
| AI 对话与 Pathfinder | 分离为两个 API | 职责清晰，避免混淆 |

---

## 3. 核心代码详解

### 3.1 Pathfinder 页面 (PathfinderPage.tsx)
**文件位置**：[PathfinderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx)

关键实现（阶段状态自动计算）：
```typescript
function recalculateStageStatus(stages: Stage[]): Stage[] {
  let shouldUnlock = true;
  return stages.map((stage) => {
    if (!shouldUnlock) {
      return { ...stage, status: "locked" };
    }
    const doneCount = stage.readings.filter((reading) => reading.done).length;
    const isDone = stage.readings.length > 0 && doneCount === stage.readings.length;
    if (isDone) {
      return { ...stage, status: "done" };
    }
    shouldUnlock = false;
    return { ...stage, status: "in_progress" };
  });
}
```

| 代码 | 解释 |
|------|------|
| shouldUnlock | 顺序解锁：前一阶段完成后才解锁下一阶段 |
| doneCount | 统计当前阶段已完成阅读项 |

### 3.2 会话持久化 (persistSession)
```typescript
const persistSession = async (nextPlan: PathfinderPlan, nextMessages: ChatMessage[], nextStageId: string) => {
  if (!accessToken) return;
  setIsSyncing(true);
  try {
    const saved = await apiUpsertPathfinderSession(accessToken, nextPlan.sessionId, {
      goal: nextPlan.goal,
      model: nextPlan.model,
      focus: nextPlan.focus,
      stages: nextPlan.stages,
      messages: nextMessages,
      activeStageId: nextStageId
    });
    mergeHistorySession(saved);
  } catch (err) {
    setSaveError(err);
  } finally {
    setIsSyncing(false);
  }
};
```

### 3.3 帖子详情页 AI 功能 (PostDetailPage.tsx)
**文件位置**：[PostDetailPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostDetailPage.tsx)

关键实现（选中文本触发）：
```typescript
const updateSelectionPopover = () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    hideSelectionPopover();
    return;
  }
  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (!text) {
    hideSelectionPopover();
    return;
  }
  // 获取选区位置并显示 popover
};
```

---

## 4. 接口契约
详见 content-service 模块文档。

---

## 5. 边界与约束
- 历史会话最多保留 20 条
- Pathfinder 会话状态同步有延迟（isSyncing 标识）
- AI 模型调用有超时时间

---

## 6. 常见问题与踩坑经验

### 6.1 AI 响应超时
**原因**：模型生成时间过长。
**解决**：前端设置合理的超时时间，并提供重试机制。

---

## 7. 可演进方向
- 支持更多 AI 模型选择
- 添加 Pathfinder 阶段分享功能
- 优化 PDF 渲染性能

---

## 8. 小结
本模块详细介绍了前端 AI 阅读与 Pathfinder 的实现，包括学习路径规划、会话持久化、选中文本操作和论文 PDF 阅读。

---

## 9. 页内导航

- 所属模块：[前端模块索引](./00-index.md)
- 上一篇：[前端阅读体验详解](./02-reading-experience.md)
- 下一篇：当前已是本模块最后一篇，建议回看 [模块索引](./00-index.md) 或继续阅读 [总览导航文档](../01-navigation-guide.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
