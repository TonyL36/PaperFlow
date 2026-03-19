const uploadBtn = document.getElementById("uploadBtn");
const pdfFileInput = document.getElementById("pdfFile");
const statusText = document.getElementById("statusText");
const pdfContainer = document.getElementById("pdfContainer");
const translationResult = document.getElementById("translationResult");
const modeSelect = document.getElementById("mode");
const sourceLangInput = document.getElementById("sourceLang");
const targetLangInput = document.getElementById("targetLang");

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const state = {
  taskId: "",
  parsedResult: null,
  pageMetrics: new Map()
};

function setStatus(text) {
  statusText.textContent = text;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function uploadPdf(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "上传失败");
  }
  return res.json();
}

async function pollTask(taskId) {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "查询任务失败");
    }
    setStatus(`任务状态: ${data.status}`);
    if (data.status === "failed") {
      throw new Error(data.error || "解析失败");
    }
    if (data.status === "completed") {
      return data.result;
    }
  }
}

function createTextLayer(pageContainer, viewport, textContent) {
  const textLayer = document.createElement("div");
  textLayer.className = "text-layer";
  textLayer.style.width = `${viewport.width}px`;
  textLayer.style.height = `${viewport.height}px`;

  for (const item of textContent.items) {
    const span = document.createElement("span");
    span.textContent = item.str;
    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const x = transform[4];
    const y = transform[5];
    const fontHeight = Math.hypot(transform[2], transform[3]);
    span.style.left = `${x}px`;
    span.style.top = `${y - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.transform = `scaleX(${transform[0] / fontHeight})`;
    textLayer.appendChild(span);
  }
  pageContainer.appendChild(textLayer);
}

async function renderPdf(pdfUrl) {
  pdfContainer.innerHTML = "";
  state.pageMetrics.clear();
  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  const pdf = await loadingTask.promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const scale = 1.6;
    const viewport = page.getViewport({ scale });
    const pageContainer = document.createElement("div");
    pageContainer.className = "page-container";
    pageContainer.dataset.page = String(pageNum);
    pageContainer.style.width = `${viewport.width}px`;
    pageContainer.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-canvas";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    pageContainer.appendChild(canvas);

    const textContent = await page.getTextContent();
    createTextLayer(pageContainer, viewport, textContent);
    pdfContainer.appendChild(pageContainer);

    state.pageMetrics.set(pageNum, {
      scale,
      width: viewport.width / scale,
      height: viewport.height / scale
    });
  }
}

function getSelectionInfo() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  if (!text) {
    return null;
  }
  const rect = range.getBoundingClientRect();
  const startNode = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
  const pageContainer = startNode.closest(".page-container");
  if (!pageContainer) {
    return null;
  }
  const pageNum = Number(pageContainer.dataset.page);
  const pageRect = pageContainer.getBoundingClientRect();
  const metric = state.pageMetrics.get(pageNum);
  if (!metric) {
    return null;
  }
  const x0 = rect.left - pageRect.left;
  const y0 = rect.top - pageRect.top;
  const x1 = rect.right - pageRect.left;
  const y1 = rect.bottom - pageRect.top;
  return {
    page: pageNum,
    text,
    selection_bbox: [x0, y0, x1, y1],
    page_height: pageRect.height,
    scale: metric.scale
  };
}

async function requestTranslate(info) {
  translationResult.textContent = "翻译中...";
  const payload = {
    task_id: state.taskId,
    page: info.page,
    selection_bbox: info.selection_bbox,
    selected_text: info.text,
    mode: modeSelect.value,
    source_lang: sourceLangInput.value || "English",
    target_lang: targetLangInput.value || "中文",
    page_height: info.page_height,
    scale: info.scale
  };
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "翻译失败");
  }
  const parts = [];
  if (data.latex) {
    parts.push(`<div class="latex-block">$$${escapeHtml(data.latex)}$$</div>`);
  }
  const textBlock = data.explanation || data.translation || "";
  if (textBlock) {
    parts.push(`<div class="text-block">${escapeHtml(textBlock).replace(/\n/g, "<br>")}</div>`);
  }
  translationResult.innerHTML = parts.join("");
  const renderMath = () => {
    if (window.renderMathInElement) {
      window.renderMathInElement(translationResult, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ]
      });
      return true;
    }
    return false;
  };
  if (!renderMath()) {
    setTimeout(renderMath, 300);
  }
}

uploadBtn.addEventListener("click", async () => {
  try {
    if (!pdfFileInput.files || !pdfFileInput.files[0]) {
      setStatus("请先选择 PDF");
      return;
    }
    setStatus("上传中...");
    translationResult.textContent = "";
    const uploadData = await uploadPdf(pdfFileInput.files[0]);
    state.taskId = uploadData.task_id;
    setStatus(`已上传，任务ID: ${state.taskId}`);
    const result = await pollTask(state.taskId);
    state.parsedResult = result;
    setStatus(`解析完成，文本块数量: ${result.block_count}`);
    await renderPdf(result.pdf_url);
    setStatus("已渲染完成，拖拽选中文本即可翻译");
  } catch (error) {
    setStatus(`错误: ${error.message}`);
  }
});

document.addEventListener("mouseup", async () => {
  try {
    if (!state.taskId) {
      return;
    }
    const info = getSelectionInfo();
    if (!info) {
      return;
    }
    await requestTranslate(info);
  } catch (error) {
    translationResult.textContent = `错误: ${error.message}`;
  }
});
