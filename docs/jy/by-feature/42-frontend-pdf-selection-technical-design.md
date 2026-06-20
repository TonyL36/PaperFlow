# 42 前端 PDF 文字选区对齐与边缘水印过滤技术文档

这篇文档记录本次 `paperflow-web` 里 PDF 阅读页文字选区问题的完整收口方案，重点回答 4 个问题：

- 为什么之前“看起来只是选区高亮不齐”，但单改 CSS 一直治不好
- 为什么最终没有继续沿官方 `TextLayer` 或整段悬停方案走
- 现在主阅读页的文字层坐标、显示缩放、选区 popover 是怎么协同的
- 为什么左右边缘水印不再进入可选区，但正文和页码仍然保留

## 功能目标与边界

目标：

- 修复 PDF 阅读页在不同窗口尺寸下的文字选区左右不齐问题
- 让浏览器原生选区高亮尽量贴近 PDF 文本真实宽度
- 保留现有 `selectionPopover`、引用追加、翻译与 AI 对话链路
- 排除左右两侧竖排边缘水印，不让它们进入可选区

边界：

- 不做悬停整段
- 不做自动整段选中
- 不做段落识别
- 不改缩略图区主逻辑
- 不引入完整 `pdf.js viewer` 体系

当前主文件位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx)

## 问题现象与结论

这次问题表面上是“高亮蒙版像 Word 那样不齐”，但实际拆下来至少有 3 层原因：

1. 主阅读页在窗口变化时，页面容器、canvas、文字层的显示尺寸同步不稳定。
2. 手写文字层的 `span` 依赖浏览器自然排版宽度，不等于 PDF 原始文本宽度。
3. 左右边缘竖排日期/水印文本也被放进了文字层，浏览器会把它们当成可选文本。

也就是说，这不是单纯颜色、透明度、圆角的问题，而是“几何 + 宽度 + 可选范围”三个层面叠加出来的观感问题。

## 方案演进

这轮最终落地前，实际走过几条路线：

- 只调 `::selection` 与透明文字层样式
  - 解决不了右边缘一截一截、不同窗口下宽度不一致的问题
- 回官方 `pdf.js TextLayer`
  - 理论上几何更标准，但这轮目标只想修文字层，不想把阅读页交互一起带回完整 viewer 模式
- 固定逻辑尺寸 + 外层缩放
  - 这一步解决了“同一页在不同窗口下反复重算另一套内部几何”的问题，但单独使用还不够
- 手写文字层保留 + PDF 原始宽度 `scaleX` 校正
  - 这是最终收口方案，兼顾可控性与实际效果

结论是：最后保留手写文字层，但不再完全相信浏览器自然排版宽度，而是拿 PDF 原始 `item.width` 去校正它。

## 最终实现

### 1. 固定逻辑页宽，不再直接跟窗口宽度绑定

主阅读页引入固定逻辑宽度 `920px`，把内部页坐标系统一到一套逻辑尺寸，再根据窗口可用宽度计算显示缩放比。

实现位置：

- 常量定义： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L25-L26)
- 页面布局状态： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L145-L145)
- resize 同步： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L257-L287)

核心思路：

```ts
const PDF_LOGICAL_PAGE_WIDTH = 920;
const logicalScale = PDF_LOGICAL_PAGE_WIDTH / baseViewport.width;
const logicalViewport = page.getViewport({ scale: logicalScale });
const displayZoom = Math.min(1, Math.max(0.4, availableWidth / logicalViewport.width));
```

这样做的意义是：

- `canvas` 和文字层共享同一套内部逻辑坐标
- 窗口变化时，主要变化的是外层显示缩放，而不是每次重新生成另一套随窗口漂移的几何

### 2. 主阅读页拆成 `shell / zoom / content`

主阅读页现在不是把 `canvas` 和文字层直接塞在一个裸容器里，而是拆成 3 层：

- `pf-pdf-main-page-shell`
- `pf-pdf-main-page-zoom`
- `pf-pdf-main-page-content`

实现位置：

- DOM 结构： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L798-L840)
- 样式： [global.css](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css#L650-L695)

这么做的原因是把“逻辑尺寸”和“显示缩放”分开：

- `content` 持有真实逻辑宽高
- `zoom` 只负责视觉缩放
- `shell` 负责占位和页面流布局

### 3. 文字层仍然手写，但坐标只基于 `logicalViewport`

本次没有切回官方 `TextLayer`，而是继续保留手写 `span` 方案；区别在于，`left/top/fontSize` 现在统一使用 `logicalScale` 和 `logicalViewport` 推导。

实现位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L410-L472)

核心渲染逻辑：

```ts
const fontSize = Math.max(8, Math.hypot(t[2], t[3]) * logicalScale);
span.style.left = `${t[4] * logicalScale}px`;
span.style.top = `${Math.max(0, logicalViewport.height - t[5] * logicalScale - fontSize)}px`;
span.style.fontSize = `${fontSize}px`;
```

这样至少先保证：

- canvas 文本绘制与文字层定位使用同一尺度
- 不再一边按窗口宽度算 canvas，一边按另一套规则摆文字层

### 4. 用 PDF 原始文本宽度对 `span` 做 `scaleX` 校正

这是本次真正解决“右边缘不齐”的关键。

问题根因是：浏览器对隐藏文字层的自然排版宽度，不一定等于 PDF 原始文本宽度，尤其在缩放、字体回退、不同字形组合下会漂。

所以现在每个有 `item.width` 的文本项，都会做一次“期望宽度 vs DOM 实测宽度”的比值校正：

实现位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L462-L469)

```ts
const expectedWidth = it.width * logicalScale;
const measuredWidth = span.getBoundingClientRect().width;
const scaleX = expectedWidth / measuredWidth;
if (Number.isFinite(scaleX) && scaleX > 0.5 && scaleX < 2 && Math.abs(scaleX - 1) > 0.02) {
  span.style.transform = `scaleX(${scaleX})`;
}
```

这里有两个约束：

- 不对所有 span 盲目缩放，只在偏差明显时才校正
- 只允许在相对安全区间内缩放，避免极端文本项导致整页形变

配套样式也把 `span` 改成了 `display: block`，让宽度与变换行为更稳定：

- 样式位置： [global.css](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css#L687-L695)

### 5. 左右边缘竖排水印不再加入文字层

用户后续补充要求是：`PDF 两侧的水印不希望被计入到可选取的范围`。

这次的处理不是“把所有边缘文字都排掉”，而是只过滤：

- 文本长度足够
- 近似竖排
- 位于左右边缘

辅助函数位置： [paperPdfTextLayer.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfTextLayer.ts#L20-L41)

接线位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L448-L453)

核心规则：

```ts
const rotation = Math.atan2(b, a);
const isVertical = Math.abs(Math.cos(rotation)) < 0.35;
const edgeThreshold = Math.max(36, input.pageWidth * 0.08);
const isOnLeftEdge = x <= edgeThreshold;
const isOnRightEdge = x >= input.pageWidth - edgeThreshold;
return isOnLeftEdge || isOnRightEdge;
```

这样做的好处是：

- 左右竖排日期、水印不再被选中
- 水平页码和正文不会被误伤

### 6. `selectionPopover` 保持原链路

本次没有重写 popover 逻辑，仍然沿用浏览器原生 selection + `Range.getBoundingClientRect()` 的方式。

实现位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L562-L603)

这是有意为之，因为本轮目标是“修文字层与可选范围”，不是重做阅读页交互。

## 自动化验证

本次除了生产代码，还补了 3 类回归测试：

### 1. 文字层 helper 测试

- 文件： [paperPdfTextLayer.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfTextLayer.test.ts#L1-L75)
- 重点覆盖：
  - 宽度/旋转相关 helper 行为
  - 左右竖排水印过滤，不误伤页码和正文

### 2. 主阅读页接线测试

- 文件： [paperPdfTextLayerIntegration.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfTextLayerIntegration.test.ts#L1-L24)
- 重点覆盖：
  - 主阅读页必须保留固定逻辑尺寸容器
  - 必须存在 `shell / zoom / content` 分层
  - 仍然沿用手写文字层，不回到其它路径

### 3. 选区样式测试

- 文件： [paperPdfSelectionVisual.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfSelectionVisual.test.ts#L1-L18)
- 重点覆盖：
  - 透明文字层策略
  - 选区高亮规则
  - 新增壳层类样式仍存在

执行命令：

```bash
npm run test -- src/ui/pages/paperPdfTextLayer.test.ts src/ui/pages/paperPdfTextLayerIntegration.test.ts src/ui/pages/paperPdfSelectionVisual.test.ts
npm run lint
```

## 验收结论

最终验收以两类观察为准：

- 同一段正文在不同窗口尺寸下，左右高光基本贴合文本真实范围
- 左右边缘竖排水印不再进入可选区

同时保留：

- 正文选区
- 页码选区
- 现有 `selectionPopover`
- AI 引用/翻译/提问链路

## 常见坑

- 只改 `::selection` 样式没法解决几何问题
  - 颜色只能改变“看起来像不像 Word”，不能改变文字层真实宽度
- 只做固定逻辑尺寸不够
  - 如果不继续解决自然排版宽度漂移，右边缘仍然会有误差
- 不能粗暴过滤所有边缘文本
  - 页码和部分正常边栏内容也是边缘文本，规则必须收得足够窄
- 不能轻易把整页交给完整 viewer
  - 这会连带影响现有阅读页交互，超出本轮收口边界

## 后续演进方向

- 把当前 `scaleX` 校正进一步收敛成独立 helper，减少主阅读页文件体积
- 若后续要支持更复杂的 PDF 字体/旋转场景，可继续引入更细粒度的 `width + transform` 策略
- 如果未来阅读页允许更大改造，再评估是否重新接回官方 `TextLayer`，但应只在验证完整交互兼容后进行
