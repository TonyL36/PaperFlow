# PDF 解析与划词翻译详解

## 1. 背景与目标

### 与前序模块的关系
本模块为前端的论文阅读功能提供底层支持，包括 PDF 上传、解析和翻译。

### 为什么要做这个
提供沉浸式论文阅读体验，支持划词翻译和公式识别。

### 功能目标
- PDF 上传与异步解析
- 基于 MinerU 的内容块提取
- 基于 IOU 与中心点的划词匹配
- 支持文本、公式和混合模式翻译

---

## 2. 架构与流程设计

### 整体流程
```
用户上传 PDF → 创建任务 → 后台 MinerU 解析 → 提取 text/title/formula 块 → 保存到数据库 → 用户划词 → 匹配块 → 调用翻译
```

### 关键决策点
| 问题 | 决策 | 理由 |
|------|------|------|
| PDF 解析 | MinerU | 开源且支持公式识别 |
| 划词匹配 | IOU + 中心点检测 | 兼顾精度和鲁棒性 |
| 任务状态 | 内存 + 数据库双存 | 兼顾查询速度和持久化 |

---

## 3. 核心代码详解

### 3.1 PDF 上传与解析任务
**文件位置**：[app/main.py](file:///f:/Gitee/PaperFlow/PaperFlow/app/main.py)

```python
@app.post("/api/upload")
async def upload_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")
    task_id = str(uuid.uuid4())
    safe_name = f"{task_id}_{Path(filename).name}"
    upload_path = UPLOAD_DIR / safe_name
    async with aiofiles.open(upload_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            await out.write(chunk)
    # ... 创建任务并后台解析
    background_tasks.add_task(process_pdf_task, task_id, str(upload_path))
    return {"task_id": task_id, "status": "queued"}
```

### 3.2 内容块提取与扁平化
```python
def flatten_blocks(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    data = parsed.get("data")
    pdf_info = []
    if isinstance(data, dict) and "pdf_info" in data:
        pdf_info = data["pdf_info"]
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and "pdf_info" in item:
                pdf_info.extend(item["pdf_info"])

    for page_idx, page in enumerate(pdf_info):
        page_num = page_idx + 1
        preproc_blocks = page.get("preproc_blocks", [])
        for block in preproc_blocks:
            b_type = block.get("type")
            bbox = block.get("bbox")
            if not bbox or not isinstance(bbox, list) or len(bbox) < 4:
                continue

            extracted_text = ""
            mapped_type = "text"

            if b_type == "text":
                mapped_type = "text"
                lines = block.get("lines", [])
                text_parts = []
                for line in lines:
                    spans = line.get("spans", [])
                    for span in spans:
                        content = span.get("content", "")
                        if span.get("type") == "inline_equation":
                            text_parts.append(f"${content}$")
                        else:
                            text_parts.append(content)
                extracted_text = "".join(text_parts)
            elif b_type == "title":
                mapped_type = "title"
                # ... 提取标题
            elif b_type == "interline_equation":
                mapped_type = "formula"
                # ... 提取公式
```

### 3.3 划词匹配
```python
def pick_candidate_blocks(result: dict[str, Any], page: int, selection_bbox: list[float], page_height: float, scale: float = 1.0) -> list[dict[str, Any]]:
    blocks = [b for b in result.get("blocks", []) if b.get("page") == page and isinstance(b.get("bbox"), list)]
    if not selection_bbox or len(selection_bbox) < 4:
        return blocks[:8]

    # 归一化坐标
    pdf_x1 = selection_bbox[0] / scale
    pdf_y1 = selection_bbox[1] / scale
    pdf_x2 = selection_bbox[2] / scale
    pdf_y2 = selection_bbox[3] / scale
    sx0 = min(pdf_x1, pdf_x2)
    sx1 = max(pdf_x1, pdf_x2)
    sy0 = min(pdf_y1, pdf_y2)
    sy1 = max(pdf_y1, pdf_y2)
    selection_poly = box(sx0, sy0, sx1, sy1)

    matched_blocks = []
    for block in blocks:
        bx0, by0, bx1, by1 = [float(v) for v in block["bbox"][:4]]
        bx0_s, bx1_s = min(bx0, bx1), max(bx0, bx1)
        by0_s, by1_s = min(by0, by1), max(by0, by1)
        poly = box(bx0_s, by0_s, bx1_s, by1_s)

        intersection = poly.intersection(selection_poly).area
        union = poly.union(selection_poly).area
        iou = intersection / union if union > 0 else 0
        # ... 其他匹配条件
        if (iou > 0.1 or ...):
            matched_blocks.append(block)
```

---

## 4. 接口契约

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/upload | POST | 上传 PDF |
| /api/tasks/{task_id} | GET | 获取解析任务状态 |
| /api/pdf/{task_id} | GET | 下载原始 PDF |
| /api/translate | POST | 翻译划词内容 |

---

## 5. 边界与约束
- 仅支持 PDF 文件
- 解析任务超时时间 5 分钟
- 划词匹配最多返回 8 个候选块

---

## 6. 常见问题与踩坑经验
- **问题**：MinerU 解析后的 JSON 结构不稳定
  - **解决**：增加多层 fallback 解析逻辑
- **问题**：坐标系统不一致（浏览器 vs PDF）
  - **解决**：统一使用左上角原点，通过 scale 参数调整

---

## 7. 可演进方向
- 接入更多 PDF 解析引擎（如 PyMuPDF）
- 支持多语言翻译
- 增加笔记与高亮功能

---

## 8. 小结
PDF 解析与划词翻译是 PaperFlow 阅读体验的核心，通过 MinerU 解析和空间匹配，实现了精准的内容提取和翻译。

---

## 9. 页内导航

- 所属模块：[Python Agent 模块索引](./00-index.md)
- 上一篇：[FiveAgentWorkflow 核心工作流详解](./01-five-agent-workflow.md)
- 下一篇：[Python Agent 与后端集成详解](./03-backend-integration.md)
- 关联阅读：
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [Deploy 模块索引](../deploy/00-index.md)
