import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AiMarkdown } from "../components/AiMarkdown";
import { useAuth } from "../auth/AuthContext";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { Button } from "../components/Button";
import { apiAiChat, apiGetPost } from "../data/api";
import type { PaperFormat, PaperFormatType, PaperHighlight, PaperHighlightLevel, PathfinderModel } from "../data/types";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { resolvePaperPdf } from "../utils/paper";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type AiMessage = { id: string; role: "assistant" | "user"; content: string; references?: string[] };
type SelectionPopover = { text: string; left: number; top: number };

function levelLabel(level: PaperHighlightLevel): string {
  if (level === "claim") return "核心结论";
  if (level === "evidence") return "关键证据";
  if (level === "risk") return "风险与局限";
  return "方法与步骤";
}

function formatLabel(type: PaperFormatType): string {
  if (type === "pdf") return "PDF";
  if (type === "html") return "HTML";
  return "Markdown";
}

function inferTranslationDirection(text: string): { source: string; target: string } {
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  return hasCjk ? { source: "中文", target: "英文" } : { source: "英文", target: "中文" };
}

function normalizeTranslationResponse(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return "后端已调用成功，但未返回可读译文。";
  const lines = raw.split("\n").map((it) => it.trim()).filter(Boolean);
  const filtered = lines.filter((line) => !/^(以下|Here is|Here’s).*(双语|bilingual|translation)/i.test(line));
  const normalized = filtered.join("\n");
  return normalized || raw;
}

function normalizeAssistantAnswer(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return "后端已调用成功，但未返回可读回答。";
  if (/已为你生成「[\s\S]*?」的 4 阶段闯关路径/.test(raw)) {
    return "当前后端返回的是路径规划文案，不是翻译/问答结果。请切换到对话接口后再试。";
  }
  if (/^关于您的问题，以下是我的回答[:：]?$/m.test(raw)) {
    return "当前回答为空模板，请重试或切换模型。";
  }
  return raw;
}

function toReferencePreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 180) return compact;
  return `${compact.slice(0, 180)}…`;
}

function buildPaperHighlights(text: string): PaperHighlight[] {
  const pieces = text
    .replace(/\s+/g, " ")
    .split(/[。！？.!?]/)
    .map((it) => it.trim())
    .filter((it) => it.length >= 18)
    .slice(0, 8);
  const levels: PaperHighlightLevel[] = ["claim", "evidence", "method", "risk"];
  const cards = pieces.map((snippet, idx) => ({
    highlightId: `h_${idx + 1}`,
    level: levels[idx % levels.length],
    title: `重点 ${idx + 1}`,
    snippet,
    anchor: { format: "pdf" as const, page: (idx % 6) + 1 }
  }));
  if (cards.length > 0) {
    return cards;
  }
  return [
    { highlightId: "h_demo_1", level: "claim", title: "重点 1", snippet: "该论文提出的新框架可显著提升任务性能。", anchor: { format: "pdf", page: 1 } },
    { highlightId: "h_demo_2", level: "evidence", title: "重点 2", snippet: "实验在多个公开数据集上取得一致提升。", anchor: { format: "pdf", page: 2 } },
    { highlightId: "h_demo_3", level: "method", title: "重点 3", snippet: "方法由检索、重排与生成三段流程组成。", anchor: { format: "pdf", page: 3 } },
    { highlightId: "h_demo_4", level: "risk", title: "重点 4", snippet: "在长尾样本下仍存在稳定性问题。", anchor: { format: "pdf", page: 4 } }
  ];
}

function pickPdfFormat(formats: PaperFormat[] | null | undefined): PaperFormat | null {
  if (!formats?.length) return null;
  return formats.find((it) => it.type === "pdf") ?? null;
}

function pageHintOf(highlight: PaperHighlight): string {
  const anchor = highlight.anchor;
  if (!anchor) return "--";
  if (anchor.format === "pdf" && typeof anchor.page === "number" && anchor.page > 0) {
    return `P${anchor.page}`;
  }
  return formatLabel(anchor.format);
}

function toRenderablePdfUrl(pdfUrl: string): string {
  if (!pdfUrl) return pdfUrl;
  if (pdfUrl.startsWith("/api/v1/public/papers/pdf-proxy")) {
    return pdfUrl;
  }
  if (pdfUrl.startsWith("/")) {
    return pdfUrl;
  }
  try {
    const parsed = new URL(pdfUrl);
    if (parsed.protocol === "https:") {
      return `/api/v1/public/papers/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`;
    }
  } catch {
  }
  return pdfUrl;
}

export function PaperPdfReaderPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : undefined;
  const { postId } = useParams();
  const [aiInput, setAiInput] = useState("");
  const [aiModel, setAiModel] = useState<PathfinderModel>("glm-4-flash");
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState<unknown | null>(null);
  const [aiReferences, setAiReferences] = useState<string[]>([]);
  const [railHidden, setRailHidden] = useState(false);
  const [selectedPdfPage, setSelectedPdfPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfRenderError, setPdfRenderError] = useState<unknown | null>(null);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfResizeTick, setPdfResizeTick] = useState(0);
  const [visibleThumbPages, setVisibleThumbPages] = useState<Set<number>>(new Set());
  const [visibleMainPages, setVisibleMainPages] = useState<Set<number>>(new Set());
  const [renderedThumbPages, setRenderedThumbPages] = useState<Set<number>>(new Set());
  const [renderedMainPages, setRenderedMainPages] = useState<Set<number>>(new Set());
  const [selectionPopover, setSelectionPopover] = useState<SelectionPopover | null>(null);
  const mainViewportRef = useRef<HTMLDivElement | null>(null);
  const thumbCanvasRefs = useRef<Map<number, HTMLCanvasElement | null>>(new Map());
  const thumbButtonRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const mainCanvasRefs = useRef<Map<number, HTMLCanvasElement | null>>(new Map());
  const mainPageRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    { id: "pdf_welcome", role: "assistant", content: "你好，我会结合左侧论文 PDF 帮你做总结、问答与术语解释。" }
  ]);

  const pid = useMemo(() => (postId ? decodeURIComponent(postId) : ""), [postId]);
  const { state, reload } = useAsyncData(async (signal) => {
    if (!pid) return null;
    return apiGetPost(pid, accessToken, signal);
  }, [pid, accessToken]);

  if (!pid) {
    return (
      <Page title="论文阅读" subtitle="缺少 postId。">
        <Card>
          <div>请从文章详情页底部的论文入口进入。</div>
        </Card>
      </Page>
    );
  }

  const post = state.data ?? null;
  const paperMeta = resolvePaperPdf(pid);
  const paperTitle = post?.title ?? paperMeta.title;
  const formats = post?.formats?.length ? post.formats : null;
  const highlights = useMemo(() => (post?.highlights?.length ? post.highlights : buildPaperHighlights(post?.content ?? "")), [post?.highlights, post?.content]);
  const pdfUrl = pickPdfFormat(formats)?.url ?? paperMeta.pdfUrl;
  const renderPdfUrl = useMemo(() => toRenderablePdfUrl(pdfUrl), [pdfUrl]);
  const pdfPageCount = pdfDoc?.numPages ?? 0;
  const thumbnailItems = useMemo(() => Array.from({ length: pdfPageCount }, (_, idx) => idx + 1), [pdfPageCount]);
  const currentUserName = auth.state.status === "authenticated" ? auth.state.displayName : "访客";

  useEffect(() => {
    let cancelled = false;
    const loadingTask = getDocument({ url: renderPdfUrl, withCredentials: false });
    setPdfDoc(null);
    setPdfRenderError(null);
    setPdfRendering(true);
    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setSelectedPdfPage(1);
      })
      .catch((err) => {
        if (cancelled) return;
        setPdfRenderError(err);
      })
      .finally(() => {
        if (!cancelled) {
          setPdfRendering(false);
        }
      });
    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [renderPdfUrl]);

  useEffect(() => {
    if (!pdfDoc) return;
    if (selectedPdfPage > pdfDoc.numPages) {
      setSelectedPdfPage(pdfDoc.numPages);
    }
  }, [pdfDoc, selectedPdfPage]);

  useEffect(() => {
    if (!pdfDoc) {
      setVisibleThumbPages(new Set());
      setVisibleMainPages(new Set());
      setRenderedThumbPages(new Set());
      setRenderedMainPages(new Set());
      return;
    }
    const initialThumbs = new Set<number>();
    const initialMainPages = new Set<number>();
    for (let i = 1; i <= Math.min(6, pdfDoc.numPages); i += 1) {
      initialThumbs.add(i);
    }
    for (let i = 1; i <= Math.min(3, pdfDoc.numPages); i += 1) {
      initialMainPages.add(i);
    }
    setVisibleThumbPages(initialThumbs);
    setVisibleMainPages(initialMainPages);
    setRenderedThumbPages(new Set());
    setRenderedMainPages(new Set());
  }, [pdfDoc]);

  useEffect(() => {
    const onResize = () => setPdfResizeTick((v) => v + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!pdfDoc) return;
    setRenderedMainPages(new Set());
  }, [pdfDoc, pdfResizeTick]);

  useEffect(() => {
    if (!thumbnailItems.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleThumbPages((prev) => {
          const next = new Set(prev);
          let changed = false;
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const pageNo = Number((entry.target as HTMLElement).dataset.pageNo ?? 0);
              if (pageNo > 0 && !next.has(pageNo)) {
                next.add(pageNo);
                changed = true;
              }
            }
          });
          return changed ? next : prev;
        });
      },
      { root: null, rootMargin: "180px 0px", threshold: 0.05 }
    );
    thumbnailItems.forEach((pageNo) => {
      const node = thumbButtonRefs.current.get(pageNo);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [thumbnailItems]);

  useEffect(() => {
    if (!thumbnailItems.length || !mainViewportRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleMainPages((prev) => {
          const next = new Set(prev);
          let changed = false;
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const pageNo = Number((entry.target as HTMLElement).dataset.pageNo ?? 0);
              if (pageNo > 0 && !next.has(pageNo)) {
                next.add(pageNo);
                changed = true;
              }
            }
          });
          return changed ? next : prev;
        });
      },
      { root: mainViewportRef.current, rootMargin: "220px 0px", threshold: 0.02 }
    );
    thumbnailItems.forEach((pageNo) => {
      const node = mainPageRefs.current.get(pageNo);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [thumbnailItems]);

  useEffect(() => {
    if (!thumbnailItems.length || !mainViewportRef.current) return;
    const viewport = mainViewportRef.current;
    let raf = 0;
    const updateSelectedByScroll = () => {
      raf = 0;
      const anchor = viewport.scrollTop + viewport.clientHeight * 0.22;
      let bestPage = selectedPdfPage;
      let bestDistance = Number.POSITIVE_INFINITY;
      thumbnailItems.forEach((pageNo) => {
        const node = mainPageRefs.current.get(pageNo);
        if (!node) return;
        const distance = Math.abs(node.offsetTop - anchor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = pageNo;
        }
      });
      setSelectedPdfPage((prev) => (prev === bestPage ? prev : bestPage));
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(updateSelectedByScroll);
    };
    updateSelectedByScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [thumbnailItems, selectedPdfPage]);

  useEffect(() => {
    const node = thumbButtonRefs.current.get(selectedPdfPage);
    if (!node) return;
    const rail = node.closest(".pf-pdf-rail") as HTMLElement | null;
    if (!rail) {
      node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      return;
    }
    const nodeTop = node.offsetTop;
    const nodeBottom = nodeTop + node.offsetHeight;
    const viewTop = rail.scrollTop;
    const viewBottom = viewTop + rail.clientHeight;
    const padding = 10;
    if (nodeTop < viewTop + padding) {
      rail.scrollTo({ top: Math.max(0, nodeTop - padding), behavior: "smooth" });
      return;
    }
    if (nodeBottom > viewBottom - padding) {
      rail.scrollTo({ top: Math.max(0, nodeBottom - rail.clientHeight + padding), behavior: "smooth" });
    }
  }, [selectedPdfPage]);

  useEffect(() => {
    if (!pdfDoc || !visibleMainPages.size || !mainViewportRef.current) return;
    let cancelled = false;
    const tasks: RenderTask[] = [];
    const renderAllVisiblePages = async () => {
      const sortedPages = Array.from(visibleMainPages).sort((a, b) => a - b);
      for (const pageNo of sortedPages) {
        if (cancelled) break;
        const canvas = mainCanvasRefs.current.get(pageNo);
        if (!canvas) continue;
        try {
          const page = await pdfDoc.getPage(pageNo);
          if (cancelled || !mainViewportRef.current) break;
          const baseViewport = page.getViewport({ scale: 1 });
          const containerWidth = Math.max(180, mainViewportRef.current.clientWidth - 24);
          const targetWidth = Math.floor(containerWidth * 0.985);
          const scale = targetWidth / baseViewport.width;
          const dpr = window.devicePixelRatio || 1;
          const viewportCss = page.getViewport({ scale });
          const viewport = page.getViewport({ scale: scale * dpr });
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewportCss.width)}px`;
          canvas.style.height = `${Math.floor(viewportCss.height)}px`;
          const task = page.render({ canvasContext: ctx, viewport });
          tasks.push(task);
          await task.promise;
          const textLayer = textLayerRefs.current.get(pageNo);
          if (textLayer) {
            textLayer.replaceChildren();
            textLayer.style.width = `${Math.floor(viewportCss.width)}px`;
            textLayer.style.height = `${Math.floor(viewportCss.height)}px`;
            const textContent = await page.getTextContent();
            for (const it of textContent.items as Array<{ str?: string; transform?: number[] }>) {
              if (!it?.str || !it.transform || it.str.trim().length === 0) continue;
              const t = it.transform;
              const fontSize = Math.max(8, Math.hypot(t[2], t[3]) * scale);
              const span = document.createElement("span");
              span.textContent = it.str;
              span.style.left = `${t[4] * scale}px`;
              span.style.top = `${Math.max(0, viewportCss.height - t[5] * scale - fontSize)}px`;
              span.style.fontSize = `${fontSize}px`;
              textLayer.appendChild(span);
            }
          }
          if (!cancelled) {
            setRenderedMainPages((prev) => {
              if (prev.has(pageNo)) return prev;
              const next = new Set(prev);
              next.add(pageNo);
              return next;
            });
          }
        } catch (err) {
          if (!cancelled) {
            setPdfRenderError(err);
          }
        }
      }
    };
    void renderAllVisiblePages();
    return () => {
      cancelled = true;
      tasks.forEach((task) => task.cancel());
    };
  }, [pdfDoc, visibleMainPages, pdfResizeTick]);

  useEffect(() => {
    if (!pdfDoc || !visibleThumbPages.size) return;
    let cancelled = false;
    const tasks: RenderTask[] = [];
    const renderThumbs = async () => {
      const sortedPages = Array.from(visibleThumbPages).sort((a, b) => a - b);
      for (const pageNo of sortedPages) {
        if (cancelled) break;
        const canvas = thumbCanvasRefs.current.get(pageNo);
        if (!canvas) continue;
        try {
          const page = await pdfDoc.getPage(pageNo);
          if (cancelled) break;
          const baseViewport = page.getViewport({ scale: 1 });
          const targetWidth = 112;
          const scale = targetWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          const task = page.render({ canvasContext: ctx, viewport });
          tasks.push(task);
          await task.promise;
          if (!cancelled) {
            setRenderedThumbPages((prev) => {
              if (prev.has(pageNo)) return prev;
              const next = new Set(prev);
              next.add(pageNo);
              return next;
            });
          }
        } catch {
        }
      }
    };
    void renderThumbs();
    return () => {
      cancelled = true;
      tasks.forEach((task) => task.cancel());
    };
  }, [pdfDoc, visibleThumbPages]);

  const appendReference = (snippet: string) => {
    setAiReferences((prev) => (prev.includes(snippet) ? prev : [...prev, snippet]));
  };
  const hideSelectionPopover = () => setSelectionPopover(null);
  const clearCurrentSelection = () => window.getSelection()?.removeAllRanges();
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
    const range = selection.getRangeAt(0);
    let ancestor: Node | null = range.commonAncestorContainer;
    if (ancestor.nodeType === Node.TEXT_NODE) {
      ancestor = ancestor.parentNode;
    }
    const inPdfTextLayer = ancestor instanceof Element && !!ancestor.closest(".pf-pdf-text-layer");
    if (!inPdfTextLayer) {
      hideSelectionPopover();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideSelectionPopover();
      return;
    }
    const left = Math.max(12, Math.min(window.innerWidth - 254, rect.left + rect.width / 2 - 121));
    const top = rect.top > 70 ? rect.top - 52 : rect.bottom + 10;
    setSelectionPopover({ text, left, top });
  };
  const appendSelectionToReferences = () => {
    if (!selectionPopover?.text) return;
    appendReference(selectionPopover.text);
    hideSelectionPopover();
    clearCurrentSelection();
  };
  const translateSelectionToChat = async () => {
    if (!selectionPopover?.text) return;
    const selected = selectionPopover.text;
    hideSelectionPopover();
    clearCurrentSelection();
    await translateReferenceToChat(selected);
  };

  const translateReferenceToChat = async (snippet: string) => {
    const now = Date.now();
    const refPreview = toReferencePreview(snippet);
    const userMsg: AiMessage = { id: `pdf_u_translate_${now}`, role: "user", content: "请翻译这段引用。", references: [refPreview] };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiError(null);
    if (auth.state.status !== "authenticated") {
      setAiMessages((prev) => [...prev, { id: `pdf_a_translate_auth_${now}`, role: "assistant", content: "请先登录后再发起后端 AI 对话。", references: [refPreview] }]);
      return;
    }
    setAiPending(true);
    try {
      const direction = inferTranslationDirection(snippet);
      const primaryPrompt = [
        "你是翻译助手。",
        `论文标题：${paperTitle}`,
        post ? `来源文章标题：${post.title}` : "",
        `把下面文本从${direction.source}翻译成${direction.target}：`,
        snippet,
        "只输出译文，不要前言，不要解释。"
      ]
        .filter(Boolean)
        .join("\n\n");
      const generated = await apiAiChat(auth.state.accessToken, {
        model: aiModel,
        systemPrompt: "你是翻译助手。",
        userPrompt: primaryPrompt
      });
      const finalText = normalizeAssistantAnswer(normalizeTranslationResponse(generated.assistantMessage || ""));
      setAiMessages((prev) => [
        ...prev,
        { id: `pdf_a_translate_${now}`, role: "assistant", content: finalText, references: [refPreview] }
      ]);
    } catch (err) {
      setAiError(err);
      setAiMessages((prev) => [...prev, { id: `pdf_a_translate_err_${now}`, role: "assistant", content: "后端翻译调用失败，请稍后重试。", references: [refPreview] }]);
    } finally {
      setAiPending(false);
    }
  };

  const sendAiMessage = async () => {
    const raw = aiInput.trim();
    const content = raw || (aiReferences.length ? "请基于引用内容进行解读。" : "");
    if (!content || aiPending) return;
    const now = Date.now();
    const refs = aiReferences.length ? aiReferences : undefined;
    const userMsg: AiMessage = { id: `pdf_u_${now}`, role: "user", content, references: refs };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiReferences([]);
    setAiError(null);
    if (auth.state.status !== "authenticated") {
      setAiMessages((prev) => [...prev, { id: `pdf_a_auth_${now}`, role: "assistant", content: "请先登录后再发起后端 AI 对话。" }]);
      return;
    }
    setAiPending(true);
    try {
      const contextRefs = refs?.length ? refs.join("\n") : "";
      const prompt = [
        "你是 PaperFlow 论文阅读助手，请根据论文标题与文章上下文回答用户问题。",
        `论文标题：${paperTitle}`,
        post ? `来源文章标题：${post.title}` : "",
        post?.content ? `来源文章正文（节选）：\n${post.content.slice(0, 5000)}` : "",
        contextRefs ? `用户引用片段：\n${contextRefs}` : "",
        `用户问题：${content}`,
        "请输出：1) 结论 2) 关键依据 3) 后续阅读建议。"
      ]
        .filter(Boolean)
        .join("\n\n");
      const generated = await apiAiChat(auth.state.accessToken, {
        model: aiModel,
        systemPrompt: "你是 PaperFlow 论文阅读助手。",
        userPrompt: prompt
      });
      setAiMessages((prev) => [
        ...prev,
        {
          id: `pdf_a_${now}`,
          role: "assistant",
          content: normalizeAssistantAnswer(generated.assistantMessage || ""),
          references: refs
        }
      ]);
    } catch (err) {
      setAiError(err);
      setAiMessages((prev) => [...prev, { id: `pdf_a_err_${now}`, role: "assistant", content: "后端 AI 调用失败，请稍后重试。" }]);
    } finally {
      setAiPending(false);
    }
  };

  const scrollToPage = (pageNo: number) => {
    setSelectedPdfPage(pageNo);
    const node = mainPageRefs.current.get(pageNo);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (selectionPopoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".pf-pdf-text-layer")) return;
      hideSelectionPopover();
    };
    const onScroll = () => hideSelectionPopover();
    const onResize = () => hideSelectionPopover();
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <Page
      title={<span className="pf-paper-page-title-offset">论文阅读</span>}
      subtitle={
        <span className="pf-paper-page-subtitle-offset">
          <Link to={`/posts/${encodeURIComponent(pid)}`}>← 返回文章详情</Link>
        </span>
      }
      actions={<Button onClick={() => setRailHidden((v) => !v)}>{railHidden ? "显示缩略栏" : "隐藏缩略栏"}</Button>}
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      <div className={["pf-pdf-layout", "pf-pdf-layout--agent", railHidden ? "pf-pdf-layout--agent-no-rail" : ""].join(" ").trim()}>
        {!railHidden ? (
          <Card className="pf-pdf-rail">
            <div className="pf-pdf-thumbs">
              {thumbnailItems.map((page) => (
                <button
                  key={`thumb_${page}`}
                  type="button"
                  className={["pf-pdf-thumb", selectedPdfPage === page ? "pf-pdf-thumb--active" : ""].join(" ").trim()}
                  data-page-no={page}
                  ref={(el) => thumbButtonRefs.current.set(page, el)}
                  onClick={() => scrollToPage(page)}
                >
                  {!renderedThumbPages.has(page) ? <div className="pf-pdf-thumb__skeleton" /> : null}
                  <canvas
                    ref={(el) => thumbCanvasRefs.current.set(page, el)}
                    className={["pf-pdf-thumb__canvas", renderedThumbPages.has(page) ? "" : "pf-pdf-thumb__canvas--hidden"].join(" ").trim()}
                  />
                  <span className="pf-pdf-thumb__page">P{page}</span>
                  <span className="pf-pdf-thumb__title">第 {page} 页</span>
                </button>
              ))}
            </div>
          </Card>
        ) : null}
        <Card className="pf-pdf-main">
          <div className="pf-pdf-header">
            <h3>{paperTitle}</h3>
            <div className="pf-muted2">{post ? `来源文章：${post.title}` : "来源文章加载中..."}</div>
            <div className="pf-pdf-legend">
              <span className="pf-pdf-legend__item"><span className="pf-hl-dot pf-hl-dot--claim" />核心结论</span>
              <span className="pf-pdf-legend__item"><span className="pf-hl-dot pf-hl-dot--evidence" />关键证据</span>
              <span className="pf-pdf-legend__item"><span className="pf-hl-dot pf-hl-dot--method" />方法与步骤</span>
              <span className="pf-pdf-legend__item"><span className="pf-hl-dot pf-hl-dot--risk" />风险与局限</span>
            </div>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              在新标签页打开原始 PDF
            </a>
          </div>
          <div className="pf-pdf-reader-surface">
            <div
              ref={mainViewportRef}
              className="pf-pdf-canvas-wrap"
              onMouseUp={() => window.setTimeout(updateSelectionPopover, 0)}
              onKeyUp={() => window.setTimeout(updateSelectionPopover, 0)}
              onTouchEnd={() => window.setTimeout(updateSelectionPopover, 0)}
            >
              {pdfRenderError ? (
                <div className="pf-pdf-fallback">
                  PDF 渲染失败，请
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    打开原始文件
                  </a>
                </div>
              ) : (
                thumbnailItems.map((page) => (
                  <div
                    key={`main_page_${page}`}
                    data-page-no={page}
                    ref={(el) => mainPageRefs.current.set(page, el)}
                    className="pf-pdf-main-page"
                  >
                    {!renderedMainPages.has(page) ? <div className="pf-pdf-main-skeleton" /> : null}
                    <canvas
                      ref={(el) => mainCanvasRefs.current.set(page, el)}
                      className={["pf-pdf-main-canvas", renderedMainPages.has(page) ? "" : "pf-pdf-main-canvas--hidden"].join(" ").trim()}
                    />
                    <div ref={(el) => textLayerRefs.current.set(page, el)} className="pf-pdf-text-layer" />
                  </div>
                ))
              )}
              {pdfRendering ? <div className="pf-pdf-canvas-loading">PDF 渲染中...</div> : null}
            </div>
          </div>
        </Card>
        <Card className="pf-ai-panel pf-ai-panel--kimi">
          <div className="pf-ai-panel__head">
            <div>
              <h3>AI 对话</h3>
              <div className="pf-muted2">结合论文内容辅助阅读</div>
            </div>
            <span className="pf-pill">Beta</span>
          </div>
          <div className="pf-ai-chatlog">
            {aiMessages.map((msg) => (
              <div key={msg.id} className={["pf-chatrow", msg.role === "user" ? "pf-chatrow--user" : "pf-chatrow--assistant"].join(" ")}>
                <div className={["pf-chatavatar", msg.role === "user" ? "pf-chatavatar--user" : "pf-chatavatar--assistant"].join(" ")}>
                  {msg.role === "user" ? (currentUserName.slice(0, 1) || "U") : "🤖"}
                </div>
                <div className={["pf-ai-chatmsg", msg.role === "user" ? "pf-ai-chatmsg--user" : "pf-ai-chatmsg--assistant"].join(" ")}>
                  {msg.references?.length ? (
                    <div className="pf-ai-msgrefs">
                      {msg.references.map((ref) => (
                        <span className="pf-ai-refchip" key={`${msg.id}_${ref.slice(0, 16)}`}>
                          {ref}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {msg.role === "assistant" ? <AiMarkdown content={msg.content} /> : msg.content}
                </div>
              </div>
            ))}
          </div>
          <div className="pf-ai-composer">
            {aiReferences.length ? (
              <div className="pf-ai-refdock">
                {aiReferences.map((ref) => (
                  <span className="pf-ai-refchip" key={`pdf_ref_${ref.slice(0, 16)}`}>
                    {ref}
                    <button className="pf-ai-refchip__remove" onClick={() => setAiReferences((prev) => prev.filter((it) => it !== ref))} aria-label="移除引用">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="pf-row" style={{ marginBottom: 8, gap: 8, alignItems: "center" }}>
              <span className="pf-muted2">模型</span>
              <select
                className="pf-select"
                style={{ width: 180 }}
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value as PathfinderModel)}
                disabled={aiPending}
              >
                <option value="glm-4-flash">glm-4-flash</option>
                <option value="glm-z1-flash">glm-z1-flash</option>
              </select>
            </div>
            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendAiMessage();
                }
              }}
              rows={3}
              className="pf-textarea"
              placeholder="向 AI 提问这篇论文，或先添加高亮片段再发送"
            />
            <div className="pf-row" style={{ justifyContent: "space-between" }}>
              <span className="pf-muted2">Shift+Enter 换行</span>
              <Button variant="primary" onClick={sendAiMessage} disabled={aiPending || (!aiInput.trim() && aiReferences.length === 0)}>
                {aiPending ? "发送中..." : "发送"}
              </Button>
            </div>
            {aiError ? <ErrorState error={aiError} title="AI 调用失败" /> : null}
          </div>
        </Card>
      </div>
      {selectionPopover ? (
        <div ref={selectionPopoverRef} className="pf-selection-popover" style={{ left: selectionPopover.left, top: selectionPopover.top }}>
          <Button className="pf-selection-popover__btn" onClick={appendSelectionToReferences}>
            🔖 添加到对话
          </Button>
          <Button className="pf-selection-popover__btn" variant="primary" onClick={() => void translateSelectionToChat()}>
            🌐 翻译
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
