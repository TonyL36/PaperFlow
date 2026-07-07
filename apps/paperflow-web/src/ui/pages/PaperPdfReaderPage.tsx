import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AiMarkdown } from "../components/AiMarkdown";
import { useAuth } from "../auth/AuthContext";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { Button } from "../components/Button";
import { apiGetPost } from "../data/api";
import type { PaperFormatType, PaperHighlight, PaperHighlightLevel } from "../data/types";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { resolvePostPdfUrl } from "../utils/paper";
import { PdfMainViewport } from "./pdfReader/PdfMainViewport";
import { PdfThumbnailRail } from "./pdfReader/PdfThumbnailRail";
import { usePdfDocument } from "./pdfReader/usePdfDocument";
import { usePaperReaderChat } from "./pdfReader/usePaperReaderChat";
import { usePdfSelectionController } from "./pdfReader/usePdfSelectionController";
import { usePdfViewport } from "./pdfReader/usePdfViewport";
import { resolvePdfReaderResponsiveLayout } from "./pdfReader/pdfReaderResponsiveLayout";

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
  const [railHidden, setRailHidden] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  const pdfSelection = usePdfSelectionController();

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const pid = useMemo(() => (postId ? decodeURIComponent(postId) : ""), [postId]);
  const { state, reload } = useAsyncData(async (signal) => {
    if (!pid) return null;
    return apiGetPost(pid, accessToken, signal);
  }, [pid, accessToken]);

  const post = state.data ?? null;
  const paperTitle = post?.title ?? "论文阅读";
  const formats = post?.formats?.length ? post.formats : null;
  const highlights = useMemo(() => (post?.highlights?.length ? post.highlights : buildPaperHighlights(post?.content ?? "")), [post?.highlights, post?.content]);
  const pdfUrl = useMemo(() => resolvePostPdfUrl(formats, post?.content), [formats, post?.content]);
  const renderPdfUrl = useMemo(() => (pdfUrl ? toRenderablePdfUrl(pdfUrl) : ""), [pdfUrl]);
  const responsiveLayout = resolvePdfReaderResponsiveLayout(viewportWidth);
  const effectiveRailHidden = railHidden || responsiveLayout.autoHideRail;
  const pdf = usePdfDocument(renderPdfUrl);
  const pdfViewport = usePdfViewport(pdf.doc, !effectiveRailHidden);
  const pdfRenderError = pdf.error ?? pdfViewport.renderError;
  const currentUserName = auth.state.status === "authenticated" ? auth.state.displayName : "访客";
  const paperReaderChat = usePaperReaderChat({ paperTitle, post });
  const railButtonLabel = responsiveLayout.autoHideRail ? "窗口较窄，已自动隐藏缩略栏" : railHidden ? "显示缩略栏" : "隐藏缩略栏";

  if (!pid) {
    return (
      <Page title="论文阅读" subtitle="缺少 postId。">
        <Card>
          <div>请从文章详情页底部的论文入口进入。</div>
        </Card>
      </Page>
    );
  }

  const appendSelectionToReferences = () => {
    if (!pdfSelection.selectionPopover?.text) return;
    paperReaderChat.appendReference(pdfSelection.selectionPopover.text);
    pdfSelection.hideSelectionPopover();
    pdfSelection.clearCurrentSelection();
  };
  const translateSelectionToChat = async () => {
    if (!pdfSelection.selectionPopover?.text) return;
    const selected = pdfSelection.selectionPopover.text;
    pdfSelection.hideSelectionPopover();
    pdfSelection.clearCurrentSelection();
    await paperReaderChat.translateReferenceToChat(selected);
  };

  return (
    <Page
      title={<span className={effectiveRailHidden ? undefined : "pf-paper-page-title-offset"}>论文阅读</span>}
      subtitle={
        <span className={effectiveRailHidden ? undefined : "pf-paper-page-subtitle-offset"}>
          <Link to={`/posts/${encodeURIComponent(pid)}`}>← 返回文章详情</Link>
        </span>
      }
      headerClassName={["pf-pdf-page-header", responsiveLayout.stackHeader ? "pf-pdf-page-header--stacked" : ""].join(" ").trim()}
      titleRowClassName="pf-pdf-page-header__title-row"
      actionsClassName="pf-pdf-page-header__actions"
      actions={
        <Button onClick={() => setRailHidden((v) => !v)} disabled={responsiveLayout.autoHideRail}>
          {railButtonLabel}
        </Button>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      <div
        className={[
          "pf-pdf-layout",
          "pf-pdf-layout--agent",
          effectiveRailHidden ? "pf-pdf-layout--agent-no-rail" : "",
          responsiveLayout.focusPdfOnly ? "pf-pdf-layout--agent-focus" : ""
        ].join(" ").trim()}
      >
        {!effectiveRailHidden ? <PdfThumbnailRail pdfViewport={pdfViewport} /> : null}
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
            {pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                在新标签页打开原始 PDF
              </a>
            ) : (
              <span className="pf-muted2">未提供可用 PDF 链接</span>
            )}
          </div>
          <PdfMainViewport
            pdfViewport={pdfViewport}
            pdfRenderError={pdfRenderError}
            pdfRendering={pdf.loading}
            pdfUrl={pdfUrl || undefined}
            onSelectionChange={pdfSelection.updateSelectionPopover}
          />
        </Card>
        {!responsiveLayout.focusPdfOnly ? (
          <Card className="pf-ai-panel pf-ai-panel--kimi">
            <div className="pf-ai-panel__head">
              <div>
                <h3>AI 对话</h3>
                <div className="pf-muted2">结合论文内容辅助阅读</div>
              </div>
              <span className="pf-pill">Beta</span>
            </div>
            <div className="pf-ai-chatlog">
              {paperReaderChat.messages.map((msg) => (
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
              {paperReaderChat.references.length ? (
                <div className="pf-ai-refdock">
                  {paperReaderChat.references.map((ref) => (
                    <span className="pf-ai-refchip" key={`pdf_ref_${ref.slice(0, 16)}`}>
                      {ref}
                      <button className="pf-ai-refchip__remove" onClick={() => paperReaderChat.removeReference(ref)} aria-label="移除引用">
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
                  value={paperReaderChat.model}
                  onChange={(e) => paperReaderChat.setModel(e.target.value as typeof paperReaderChat.model)}
                  disabled={paperReaderChat.pending}
                >
                  <option value="glm-4-flash">glm-4-flash</option>
                  <option value="glm-z1-flash">glm-z1-flash</option>
                </select>
              </div>
              <textarea
                value={paperReaderChat.input}
                onChange={(e) => paperReaderChat.setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void paperReaderChat.sendAiMessage();
                  }
                }}
                rows={3}
                className="pf-textarea"
                placeholder="向 AI 提问这篇论文，或先添加高亮片段再发送"
              />
              <div className="pf-row" style={{ justifyContent: "space-between" }}>
                <span className="pf-muted2">Shift+Enter 换行</span>
                <Button
                  variant="primary"
                  onClick={paperReaderChat.sendAiMessage}
                  disabled={paperReaderChat.pending || (!paperReaderChat.input.trim() && paperReaderChat.references.length === 0)}
                >
                  {paperReaderChat.pending ? "发送中..." : "发送"}
                </Button>
              </div>
              {paperReaderChat.error ? <ErrorState error={paperReaderChat.error} title="AI 调用失败" /> : null}
            </div>
          </Card>
        ) : null}
      </div>
      {pdfSelection.selectionPopover ? (
        <div
          ref={pdfSelection.selectionPopoverRef}
          className="pf-selection-popover"
          style={{ left: pdfSelection.selectionPopover.left, top: pdfSelection.selectionPopover.top }}
        >
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
