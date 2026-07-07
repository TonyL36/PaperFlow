# 为什么 PDF 阅读页的高亮总是对不齐，我们最后是怎么把它修到可用的

> 摘要：PDF 阅读页的文字选区问题，表面上看只是“高亮不像 Word 那样整齐”，但真正拆开后，它通常不是一个 CSS 问题，而是文字层几何、浏览器自然排版宽度和可选范围边界一起叠加出来的结果。PaperFlow 这轮最终没有继续只调 `::selection`，也没有把整页重新接回完整 `pdf.js viewer`，而是收敛成了一条更可控的方案：固定逻辑页宽、把主阅读页拆成 `shell / zoom / content`、保留手写文字层、用 PDF 原始 `item.width` 对文本 `span` 做 `scaleX` 校正，同时把左右边缘竖排水印排除出可选区。本文按问题现象、方案演进、关键代码和测试验证，整理这次修复是怎样一步步收口的。
>
> 标签：React｜pdf.js｜前端工程｜PDF 阅读器｜文字选区｜问题排查

很多人第一次做 PDF 阅读页时，都会先觉得这件事“应该不复杂”：

- 先把 PDF 用 canvas 画出来；
- 再盖一层透明文字层；
- 浏览器原生 selection 自然就能工作。

这条路一开始确实能跑。  
但只要你开始真的拿它做阅读、划词、引用和翻译，问题就会慢慢冒出来。

这次在 PaperFlow 的论文阅读页里，用户实际反馈的不是“选不了”，而是更烦的一类问题：

- 同一句话，在小窗和大窗下，高亮宽度不一致；
- 右边缘会出现一截一截、不贴文本的感觉；
- 左右边缘的竖排日期/水印，也会被选进来；
- 单改颜色、透明度、圆角之后，观感还是不对。

这就意味着，问题已经不只是“选区颜色像不像 Word”，而是文字层这套几何本身不够稳。

## 1. 这次问题，最后并没有落在 CSS 上

如果只看表象，最容易想到的做法是继续调这些东西：

- `::selection` 的颜色和透明度；
- 文字层 `span` 的透明策略；
- 圆角、边缘平滑、阴影之类的视觉样式。

这些当然能影响“像不像 Word”，但它解决不了更根上的问题：

- `canvas` 和文字层是不是在同一套坐标系里；
- 浏览器自然排出来的文字宽度，是不是真的等于 PDF 原始文本宽度；
- 边缘竖排水印是不是也被塞进了文字层。

换句话说，这次问题表面上像“高亮不好看”，实际上至少有 3 层根因：

1. 主阅读页在窗口变化时，页面容器、canvas、文字层的显示尺寸同步不够稳定。
2. 手写文字层里的 `span` 依赖浏览器自然排版宽度，不一定等于 PDF 原始 `item.width`。
3. 左右边缘竖排日期/水印文本也进入了文字层，所以浏览器会把它们当成可选文本。

所以最后结论很明确：  
这不是单一视觉问题，而是“几何 + 宽度 + 可选范围”叠加出来的阅读体验问题。

## 2. 为什么这轮没有继续走官方 TextLayer 或整段悬停

这轮中间其实试过几条路。

第一条路，是继续调 CSS。  
这个方向最大的问题是，它最多只能让错误的几何“看起来不那么刺眼”，但不能让错位真的消失。

第二条路，是回官方 `pdf.js TextLayer`。  
这个方向的优点很直接：官方几何更完整，理论上更接近标准行为。  
但在 PaperFlow 当前这张阅读页里，除了选区之外还有：

- `selectionPopover`
- 引用追加
- 翻译
- AI 对话联动

如果这轮把整页重新往完整 viewer 体系上靠，代价就不只是“换一个文字层实现”，而是会把已有交互链路一起拖进去。  
这超出了当时的收口边界。

第三条路，就是最后真正落地的方向：

- 固定逻辑页宽；
- 把主阅读页拆成 `shell / zoom / content`；
- 继续保留手写文字层；
- 不再完全相信浏览器自然宽度，而是拿 PDF 原始宽度去校正；
- 只排除左右竖排水印，不误伤页码和正文。

这条路不是最“标准”的，但在当前项目状态下是最可控的。

## 3. 第一步不是修高亮，而是先固定内部坐标系

主阅读页现在先引入了一套固定逻辑页宽：

- `PDF_LOGICAL_PAGE_WIDTH = 920`

代码位置：

- 常量与状态： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L25-L26)
- 页面布局状态： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L145-L145)
- resize 同步： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L259-L277)

核心逻辑是：

```ts
const PDF_LOGICAL_PAGE_WIDTH = 920;
const logicalScale = PDF_LOGICAL_PAGE_WIDTH / baseViewport.width;
const logicalViewport = page.getViewport({ scale: logicalScale });
const displayZoom = Math.min(1, Math.max(0.4, availableWidth / logicalViewport.width));
```

这一步的意义，不是简单地“把页面变成 920 宽”，而是把内部坐标系统一成一套不会随着窗口宽度反复漂移的逻辑尺寸。

这样一来：

- `canvas` 和文字层共享同一套内部坐标；
- 窗口变化时，主要变化的是显示缩放，不是内部几何本身；
- 同一页在不同窗口下，不会每次都生成另一套新的文字层坐标。

这一步本身还不够解决所有问题，但它是后面所有修复的基础。

## 4. 主阅读页拆成 3 层，本质上是在分离“逻辑尺寸”和“显示缩放”

现在主阅读页不是把 `canvas` 和文字层直接塞在一个容器里，而是拆成了：

- `pf-pdf-main-page-shell`
- `pf-pdf-main-page-zoom`
- `pf-pdf-main-page-content`

代码位置：

- DOM 结构： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L805-L840)
- 样式： [global.css](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css#L650-L691)

这个结构看起来像是“多包了一层壳”，但真正的意义是把两个以前混在一起的概念拆开了：

- `content` 保存逻辑宽高；
- `zoom` 负责视觉缩放；
- `shell` 负责页面流里的占位和滚动布局。

以前一旦窗口变化，阅读页里很多尺寸会一起变。  
现在内部页坐标尽量稳定，变化主要发生在外层显示上。

这就是为什么这一步虽然不是最终答案，却能先解决一部分“小窗和大窗下几何反复变化”的问题。

## 5. 真正把右边缘拉回来的，不是样式，而是 PDF 宽度校正

这次真正打到根上的，是 `scaleX` 校正。

问题根因很简单：  
浏览器对透明文字层的自然排版宽度，不一定等于 PDF 原始文本宽度。

尤其在这些场景里更容易漂：

- 字体回退；
- 缩放显示；
- 不同单词和标点组合；
- 浏览器自己的排版细节。

所以最后的做法不是继续盲调 `font-size` 或 `left/top`，而是把 PDF 原始 `item.width` 拿出来，直接和 DOM 实际宽度对比。

实现位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L451-L469)

核心代码：

```ts
const expectedWidth = it.width * logicalScale;
const measuredWidth = span.getBoundingClientRect().width;
const scaleX = expectedWidth / measuredWidth;
if (Number.isFinite(scaleX) && scaleX > 0.5 && scaleX < 2 && Math.abs(scaleX - 1) > 0.02) {
  span.style.transform = `scaleX(${scaleX})`;
}
```

这里其实做了两层约束。

第一层，不是所有文本项都盲目校正。  
只有当 PDF 宽度和 DOM 宽度偏差足够明显时，才真的动 `scaleX`。

第二层，校正范围也被卡在相对安全的区间里。  
如果某个文本项的比例离谱到不像正常文本，就不强行缩放，避免把整页搞得更奇怪。

配套样式也顺手做了一步收口：

- 把文字层 `span` 设成 `display: block`

对应位置： [global.css](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css#L687-L696)

这一步是为了让宽度、变换和排版行为更稳定，不再完全依赖 inline 文本的天然行为。

## 6. 为什么左右水印不再能选中，但页码还能保留

主问题修完之后，用户又补了一个很实际的要求：

> PDF 两侧的水印不希望被计入到可选取的范围。

这里最容易犯的错，是“一刀切把所有边缘文本都排掉”。  
这样确实能把水印去掉，但也很容易误伤：

- 页码；
- 正常边栏文字；
- 一些靠边但其实有业务意义的正文内容。

所以最后没有走粗暴规则，而是只过滤满足下面三个条件的文本项：

- 文本长度足够；
- 近似竖排；
- 位于页面左右边缘。

辅助函数位置： [paperPdfTextLayer.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfTextLayer.ts#L20-L41)

接线位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L447-L454)

核心逻辑：

```ts
const rotation = Math.atan2(b, a);
const isVertical = Math.abs(Math.cos(rotation)) < 0.35;
const edgeThreshold = Math.max(36, input.pageWidth * 0.08);
const isOnLeftEdge = x <= edgeThreshold;
const isOnRightEdge = x >= input.pageWidth - edgeThreshold;
return isOnLeftEdge || isOnRightEdge;
```

这套规则的结果是：

- 左右竖排日期、水印不再进入可选区；
- 水平页码和正文保留；
- 过滤范围尽量收窄，不把边缘文字一锅端。

## 7. 为什么 `selectionPopover` 这轮没有重写

这轮一个很关键的取舍是：  
修文字层，不重做阅读页交互。

所以 `selectionPopover` 仍然沿用浏览器原生 selection + `Range.getBoundingClientRect()` 的链路。

实现位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L562-L603)

这背后的考虑很现实：

- 当前问题的核心不在 popover，而在文字层几何和可选范围；
- 如果这一轮顺手把 popover、整段悬停、段落识别一起改掉，问题边界会再次失控；
- 先把“选区贴不贴文字”修到可用，再决定后面要不要继续扩交互。

对于一个还在迭代中的阅读页来说，这种收口方式通常更稳。

## 8. 这次是怎么验证它真的修好了

这轮除了肉眼复测，还补了 3 类自动化验证。

### 8.1 文字层 helper 测试

文件： [paperPdfTextLayer.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfTextLayer.test.ts#L1-L75)

重点覆盖：

- 宽度/旋转相关 helper 行为；
- 左右竖排水印过滤；
- 页码和正文不被误伤。

### 8.2 主阅读页接线测试

文件： [paperPdfTextLayerIntegration.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfTextLayerIntegration.test.ts#L1-L24)

重点覆盖：

- 主阅读页保留固定逻辑尺寸容器；
- 存在 `shell / zoom / content` 分层；
- 继续沿用手写文字层，不回到别的渲染路线。

### 8.3 选区样式测试

文件： [paperPdfSelectionVisual.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/paperPdfSelectionVisual.test.ts#L1-L18)

重点覆盖：

- 透明文字层策略；
- 选区高亮规则；
- 新增壳层类样式仍然存在。

执行命令：

```bash
npm run test -- src/ui/pages/paperPdfTextLayer.test.ts src/ui/pages/paperPdfTextLayerIntegration.test.ts src/ui/pages/paperPdfSelectionVisual.test.ts
npm run lint
```

最终验收看的也不是一堆抽象指标，而是两件很具体的事：

- 同一段正文在不同窗口尺寸下，左右高光是否基本贴合文本真实范围；
- 左右边缘竖排水印是否已经不能再被选中。

## 9. 这次修复里最值得记住的几个坑

第一个坑，是把选区问题误判成纯 CSS 问题。  
颜色、透明度、圆角当然重要，但它们解决不了文字层真实宽度错位。

第二个坑，是以为固定逻辑尺寸就够了。  
如果不继续解决浏览器自然排版宽度漂移，右边缘误差还是会留着。

第三个坑，是对边缘文字做粗暴过滤。  
水印确实在边缘，但页码和部分正常内容也可能在边缘，所以规则一定要足够收。

第四个坑，是过早把整页重新交给完整 viewer。  
如果当前阅读页上已经叠了不少交互，这么做会把“修文字层”升级成“重做阅读页体系”，风险会迅速放大。

## 10. 回头看，这次方案最核心的价值不是完美，而是收得住

如果只从“理论最标准”的角度看，直接回官方 `TextLayer` 当然很有吸引力。  
但真实项目里的工程选择，很多时候不是“谁最标准”，而是“谁在当前边界里最可控”。

这次最后收口成：

- 固定逻辑页宽；
- 分离 `shell / zoom / content`；
- 保留手写文字层；
- 用 PDF 原始宽度校正自然排版；
- 只排除左右边缘竖排水印。

它不是一次“大而全”的重构，但它把用户最在意的那件事真正修到了可用：

- 正文高亮更贴文本；
- 不同窗口下不再明显失真；
- 水印不再乱入可选区；
- 现有引用、翻译、AI 对话链路都保住了。

如果后面还要继续演进，这里还有两条比较自然的路：

- 把当前 `scaleX` 校正继续收敛成独立 helper，减轻 [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx) 的复杂度；
- 等阅读页交互边界更稳定之后，再评估是否重新接回官方 `TextLayer`，但前提一定是先把兼容性验证做完整。
