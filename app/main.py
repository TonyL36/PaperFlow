import asyncio
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import aiofiles
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from shapely.geometry import box, Point

from app.agents import (
    AgentPdfQaRequest,
    AgentPdfQaResponse,
    FileCheckpointStore,
    FiveAgentWorkflow,
    WorkflowRequest,
    WorkflowResponse,
    tokenize,
)
from app.services.deepseek_client import DeepSeekClient
from app.services.mineru_adapter import MinerUAdapter
from app.services.paperflow_db import PaperflowDbConfig, PaperflowDbService

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PARSE_DIR = DATA_DIR / "parsed"
AGENT_RUN_DIR = DATA_DIR / "agent_runs"
STATIC_DIR = BASE_DIR / "app" / "static"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PARSE_DIR.mkdir(parents=True, exist_ok=True)
AGENT_RUN_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="MinerU + DeepSeek 划词翻译 Demo", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/files/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

mineru_adapter = MinerUAdapter()
deepseek_client = DeepSeekClient(
    api_key=os.getenv("DEEPSEEK_API_KEY", ""),
    model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
    base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
)
paperflow_db = PaperflowDbService(PaperflowDbConfig.from_env())
five_agent_workflow = FiveAgentWorkflow(
    uploads_dir=UPLOAD_DIR,
    checkpoint_store=FileCheckpointStore(AGENT_RUN_DIR),
    db_service=paperflow_db,
)
ALLOW_CLIENT_API_KEY = os.getenv("ALLOW_CLIENT_API_KEY", "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class TaskRecord:
    task_id: str
    status: str
    filename: str
    upload_path: str
    created_at: str
    updated_at: str
    result_path: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


class TranslateRequest(BaseModel):
    task_id: str
    page: int = Field(ge=1)
    selection_bbox: list[float] = Field(default_factory=list)
    selected_text: str = ""
    mode: str = "auto"
    source_lang: str = "English"
    target_lang: str = "中文"
    page_height: float = 0.0
    scale: float = 1.0
    deepseek_api_key: str = ""


tasks: dict[str, TaskRecord] = {}
tasks_lock = asyncio.Lock()


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def extract_json_payload(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 3:
            cleaned = parts[1].strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        data = json.loads(cleaned[start : end + 1])
    except Exception:
        return None
    if isinstance(data, dict):
        return data
    return None


def extract_latex_from_text(text: str) -> str:
    if not text:
        return ""
    cleaned = text.strip()
    fence = re.search(r"```(?:latex)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()
    patterns = [
        r"\$\$([\s\S]*?)\$\$",
        r"\\\[(.+?)\\\]",
        r"\$(.+?)\$",
    ]
    for pattern in patterns:
        match = re.search(pattern, cleaned)
        if match:
            candidate = match.group(1).strip()
            if candidate:
                return candidate
    line_match = re.search(r"(?:latex|公式|LaTeX)\s*[:：]\s*(.+)", cleaned, re.IGNORECASE)
    if line_match:
        return line_match.group(1).strip()
    return ""


def normalize_bbox(raw_bbox: Any, page_height: float = 0.0) -> list[float] | None:
    if isinstance(raw_bbox, dict):
        keys = ["x0", "y0", "x1", "y1"]
        if all(k in raw_bbox for k in keys):
            return [float(raw_bbox["x0"]), float(raw_bbox["y0"]), float(raw_bbox["x1"]), float(raw_bbox["y1"])]
        alt_keys = ["left", "top", "right", "bottom"]
        if all(k in raw_bbox for k in alt_keys):
            return [float(raw_bbox["left"]), float(raw_bbox["top"]), float(raw_bbox["right"]), float(raw_bbox["bottom"])]
    if isinstance(raw_bbox, list) and len(raw_bbox) >= 4:
        if len(raw_bbox) == 8:
            xs = [float(raw_bbox[i]) for i in [0, 2, 4, 6]]
            ys = [float(raw_bbox[i]) for i in [1, 3, 5, 7]]
            return [min(xs), min(ys), max(xs), max(ys)]
        values = [float(raw_bbox[0]), float(raw_bbox[1]), float(raw_bbox[2]), float(raw_bbox[3])]
        return values
    if isinstance(raw_bbox, tuple) and len(raw_bbox) >= 4:
        values = [float(raw_bbox[0]), float(raw_bbox[1]), float(raw_bbox[2]), float(raw_bbox[3])]
        return values
    if page_height > 0 and isinstance(raw_bbox, list) and len(raw_bbox) == 8:
        xs = [float(raw_bbox[i]) for i in [0, 2, 4, 6]]
        ys = [float(raw_bbox[i]) for i in [1, 3, 5, 7]]
        return [min(xs), min(ys), max(xs), max(ys)]
    return None


def build_formula_debug(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    formula_blocks = [b for b in blocks if str(b.get("type", "")).lower() == "formula"]
    samples: list[dict[str, Any]] = []
    for block in formula_blocks[:12]:
        text = str(block.get("text", "")).strip()
        samples.append(
            {
                "page": block.get("page"),
                "type": block.get("type"),
                "text_preview": text[:200],
            }
        )
    return {
        "formula_count": len(formula_blocks),
        "formula_samples": samples,
    }


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
                lines = block.get("lines", [])
                if lines:
                    spans = lines[0].get("spans", [])
                    if spans:
                        extracted_text = spans[0].get("content", "")
            elif b_type == "interline_equation":
                mapped_type = "formula"
                lines = block.get("lines", [])
                text_parts = []
                if lines:
                    for line in lines:
                        spans = line.get("spans", [])
                        for span in spans:
                            text_parts.append(span.get("content", ""))
                extracted_text = "".join(text_parts)
                if not extracted_text:
                    extracted_text = block.get("text", "") or block.get("latex", "")
            else:
                continue
                
            if extracted_text:
                blocks.append({
                    "id": str(uuid.uuid4()),
                    "page": page_num,
                    "bbox": [float(v) for v in bbox[:4]],
                    "text": extracted_text.strip(),
                    "type": mapped_type,
                })
                
    return blocks


async def update_task(task_id: str, **kwargs: Any) -> None:
    async with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            return
        for k, v in kwargs.items():
            setattr(task, k, v)
        task.updated_at = now_iso()


async def process_pdf_task(task_id: str, pdf_path: str) -> None:
    await update_task(task_id, status="parsing")
    output_dir = PARSE_DIR / task_id
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        raw_data = await mineru_adapter.parse_pdf(pdf_path=pdf_path, output_dir=str(output_dir))
        blocks = flatten_blocks(raw_data)
        formula_debug = build_formula_debug(blocks)
        for item in formula_debug.get("formula_samples", []):
            print(
                f"[FORMULA] page={item.get('page')} type={item.get('type')} text={item.get('text_preview')}",
                flush=True,
            )
        result = {
            "task_id": task_id,
            "pdf_url": f"/api/pdf/{task_id}",
            "blocks": blocks,
            "block_count": len(blocks),
            "raw": raw_data,
        }
        result_path = output_dir / "normalized.json"
        async with aiofiles.open(result_path, "w", encoding="utf-8") as f:
            await f.write(json.dumps(result, ensure_ascii=False))
        await update_task(
            task_id,
            status="completed",
            result=result,
            result_path=str(result_path),
            meta={"block_count": len(blocks), **formula_debug},
        )
        await paperflow_db.save_parsed_paper(
            task_id=task_id,
            filename=Path(pdf_path).name.split("_", 1)[1] if "_" in Path(pdf_path).name else Path(pdf_path).name,
            upload_path=pdf_path,
            blocks=blocks,
            raw_data=raw_data,
            parse_meta=formula_debug,
        )
    except Exception as e:
        await update_task(task_id, status="failed", error=str(e))
        await paperflow_db.mark_task_failed(task_id, str(e))


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


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
    record = TaskRecord(
        task_id=task_id,
        status="queued",
        filename=filename,
        upload_path=str(upload_path),
        created_at=now_iso(),
        updated_at=now_iso(),
    )
    async with tasks_lock:
        tasks[task_id] = record
    await paperflow_db.upsert_upload_task(
        task_id=task_id,
        filename=filename,
        upload_path=str(upload_path),
        source="uploaded",
    )
    background_tasks.add_task(process_pdf_task, task_id, str(upload_path))
    return {"task_id": task_id, "status": "queued"}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str) -> dict[str, Any]:
    async with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        return {
            "task_id": task.task_id,
            "status": task.status,
            "filename": task.filename,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "error": task.error,
            "meta": task.meta,
            "result": task.result if task.status == "completed" else None,
        }


@app.get("/api/papers")
async def list_papers(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1 到 100 之间")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset 不能小于 0")
    items = await paperflow_db.list_papers(limit=limit, offset=offset)
    return {"items": items, "limit": limit, "offset": offset}


@app.get("/api/papers/{paper_id}")
async def get_paper(paper_id: str) -> dict[str, Any]:
    paper = await paperflow_db.get_paper(paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")
    return paper


@app.get("/api/pdf/{task_id}")
async def get_pdf(task_id: str) -> FileResponse:
    async with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        path = Path(task.upload_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(path, media_type="application/pdf", filename=path.name)


def pick_candidate_blocks(result: dict[str, Any], page: int, selection_bbox: list[float], page_height: float, scale: float = 1.0) -> list[dict[str, Any]]:
    blocks = [b for b in result.get("blocks", []) if b.get("page") == page and isinstance(b.get("bbox"), list)]
    if not selection_bbox or len(selection_bbox) < 4:
        return blocks[:8]

    # MinerU uses Top-Left origin, same as browser DOM. Do not flip Y axis.
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
        
        selection_coverage = intersection / selection_poly.area if selection_poly.area > 0 else 0
        block_coverage = intersection / poly.area if poly.area > 0 else 0

        cx = (bx0_s + bx1_s) / 2
        cy = (by0_s + by1_s) / 2
        
        scx = (sx0 + sx1) / 2
        scy = (sy0 + sy1) / 2

        if (iou > 0.1 or 
            selection_poly.contains(Point(cx, cy)) or 
            poly.contains(Point(scx, scy)) or
            selection_coverage > 0.4 or 
            block_coverage > 0.4):
            matched_blocks.append(block)

    matched_blocks.sort(key=lambda b: (min(b["bbox"][1], b["bbox"][3]), min(b["bbox"][0], b["bbox"][2])))
    print(f"[MATCHING] selection: {sx0:.1f},{sy0:.1f},{sx1:.1f},{sy1:.1f} | matched {len(matched_blocks)} blocks", flush=True)
    for i, b in enumerate(matched_blocks):
        print(f"  - Block {i}: type={b.get('type')}, bbox={b.get('bbox')}, text={b.get('text')[:50]}...", flush=True)
    return matched_blocks


def pick_formula_latex(candidate_blocks: list[dict[str, Any]]) -> str:
    for block in candidate_blocks:
        if block.get("type") == "formula":
            text = str(block.get("text", "")).strip()
            if text:
                return text
    return ""


def pick_formula_latex_candidates(candidate_blocks: list[dict[str, Any]], limit: int = 4) -> list[str]:
    formulas: list[str] = []
    for block in candidate_blocks:
        if block.get("type") != "formula":
            continue
        text = str(block.get("text", "")).strip()
        if not text:
            continue
        if text in formulas:
            continue
        formulas.append(text)
        if len(formulas) >= limit:
            break
    return formulas


@app.post("/api/translate")
async def translate(req: TranslateRequest) -> dict[str, Any]:
    async with tasks_lock:
        task = tasks.get(req.task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task.status != "completed" or not task.result:
            raise HTTPException(status_code=400, detail="任务尚未解析完成")
        result = task.result

    candidate_blocks = pick_candidate_blocks(result, req.page, req.selection_bbox, req.page_height, req.scale)
    
    reconstructed_text_parts = []
    has_formula = False
    has_text = False
    
    for b in candidate_blocks:
        b_type = b.get("type")
        b_text = b.get("text", "")
        if b_type == "formula":
            has_formula = True
            reconstructed_text_parts.append(f"${b_text}$")
        elif b_type in ["text", "title"]:
            has_text = True
            if "$" in b_text:  # 包含行内公式
                has_formula = True
            reconstructed_text_parts.append(b_text)
            
    reconstructed_text = " ".join(reconstructed_text_parts)
    
    mode = req.mode
    if mode == "auto":
        if has_formula and has_text:
            mode = "mixed"
        elif has_formula and not has_text and len(candidate_blocks) == 1:
            mode = "formula"
        else:
            mode = "text"
            
    selected_text = reconstructed_text or req.selected_text.strip()
    joined_context = "\n".join([b["text"] for b in candidate_blocks if b.get("text")])[:5000]

    system_prompt = "你是专业的技术翻译助手。输出必须简洁准确，保留术语与符号。"
    if mode == "formula":
        formula_latex = pick_formula_latex(candidate_blocks)
        user_prompt = (
            f"请把以下公式相关内容从{req.source_lang}解释并翻译为{req.target_lang}。\n"
            "只输出严格 JSON，不要代码块，不要多余文本。字段：latex, explanation, translation。\n"
            "latex 仅给公式 LaTeX 源码（不要包含 $ 或 $$）。\n"
            "explanation 用中文简要解释公式含义与符号。\n"
            "translation 为整段翻译结果。\n\n"
            f"划词内容：\n{selected_text}\n\n上下文：\n{joined_context}"
        )
    elif mode == "mixed":
        formula_candidates = pick_formula_latex_candidates(candidate_blocks, limit=6)
        hint_lines = "\n".join([f"- {item}" for item in formula_candidates]) if formula_candidates else "无"
        user_prompt = (
            f"请把以下混合内容从{req.source_lang}翻译为{req.target_lang}。\n"
            "要求：保留所有 $...$ 包裹的公式不变，仅翻译自然语言部分；翻译后另起一段简要解释文中公式含义。\n"
            "只输出严格 JSON，不要代码块，不要多余文本。字段：translation, formulas_used。\n"
            "formulas_used 为你最终采用的 LaTeX 公式数组。\n\n"
            f"划词内容：\n{selected_text}\n\n可用公式候选：\n{hint_lines}\n\n上下文：\n{joined_context}"
        )
        # 强制添加 $ 标记，如果 selected_text 里没有 $ 符号
        if "$" not in selected_text and formula_candidates:
             user_prompt += "\n\n注意：虽然划词内容中可能看起来没有公式，但请结合上下文和公式候选，识别其中可能存在的公式变量。"
    else:
        user_prompt = (
            f"请把以下内容从{req.source_lang}翻译为{req.target_lang}，保持专业准确，必要时补充一句术语说明。\n\n"
            f"划词内容：\n{selected_text}\n\n上下文：\n{joined_context}"
        )
    translated = await deepseek_client.translate(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        api_key=req.deepseek_api_key.strip() if ALLOW_CLIENT_API_KEY else None,
    )
    latex = ""
    explanation = ""
    translation_text = translated
    if mode == "formula":
        payload = extract_json_payload(translated)
        if payload:
            latex = str(payload.get("latex", "")).strip()
            explanation = str(payload.get("explanation", "")).strip()
            translation_text = str(payload.get("translation", "")).strip() or explanation or translated
        if not latex:
            latex = pick_formula_latex(candidate_blocks)
        if not latex:
            latex = extract_latex_from_text(translated)
    elif mode == "mixed":
        payload = extract_json_payload(translated)
        if payload:
            translation_text = str(payload.get("translation", "")).strip() or translated
    return {
        "task_id": req.task_id,
        "page": req.page,
        "mode": mode,
        "matched_blocks": candidate_blocks,
        "selected_text": selected_text,
        "translation": translation_text,
        "latex": latex,
        "explanation": explanation,
    }


@app.post("/api/agents/workflow", response_model=WorkflowResponse)
async def run_five_agent_workflow(req: WorkflowRequest) -> WorkflowResponse:
    return await five_agent_workflow.run(req)


@app.get("/api/agents/runs/{run_id}")
async def get_five_agent_run(run_id: str) -> dict[str, Any]:
    state = five_agent_workflow.get_run(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail="运行记录不存在")
    return state.model_dump(mode="json")


@app.post("/api/agents/sage/pdf-qa", response_model=AgentPdfQaResponse)
async def answer_pdf_with_sage(req: AgentPdfQaRequest) -> AgentPdfQaResponse:
    async with tasks_lock:
        task = tasks.get(req.task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task.status != "completed" or not task.result:
            raise HTTPException(status_code=400, detail="任务尚未解析完成")
        blocks = task.result.get("blocks", [])

    filtered_blocks = blocks
    if req.page is not None:
        filtered_blocks = [block for block in blocks if block.get("page") == req.page]
    if req.selected_text.strip():
        selected_tokens = set(tokenize(req.selected_text))
        if selected_tokens:
            boosted = []
            for block in filtered_blocks:
                block_tokens = set(tokenize(str(block.get("text", ""))))
                if selected_tokens & block_tokens:
                    boosted.append(block)
            if boosted:
                filtered_blocks = boosted

    return five_agent_workflow.answer_pdf(
        task_id=req.task_id,
        question=req.question,
        blocks=filtered_blocks,
        top_k=req.top_k,
    )
