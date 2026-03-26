import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiCreateComment, apiFavoritePost, apiGeneratePathfinderPlan, apiGetPost, apiListComments, apiUnfavoritePost } from "../data/api";
import type { Comment, PathfinderModel, Post } from "../data/types";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/Alert";
import { AiMarkdown } from "../components/AiMarkdown";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { RichText } from "../components/RichText";
import { Spinner } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { formatDateTime, readingTimeMinutes, sourceMeta } from "../utils/format";
import { resolvePaperPdf } from "../utils/paper";

type DetailData = { post: Post | null; comments: Comment[] };
type AiMessage = { id: string; role: "assistant" | "user"; content: string; references?: string[] };
type SelectionPopover = { text: string; left: number; top: number };
const aiWelcomeMessage: AiMessage = { id: "m_welcome", role: "assistant", content: "你好，我是 PaperFlow 阅读助手。你可以让我总结、解释术语或提炼重点。" };

export function PostDetailPage() {
  const { postId } = useParams();
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : undefined;
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [aiModel, setAiModel] = useState<PathfinderModel>("glm-4-flash");
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState<unknown | null>(null);
  const [aiReferences, setAiReferences] = useState<string[]>([]);
  const [selectionPopover, setSelectionPopover] = useState<SelectionPopover | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([aiWelcomeMessage]);
  const articleBodyRef = useRef<HTMLDivElement | null>(null);
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null);

  const pid = useMemo(() => (postId ? decodeURIComponent(postId) : ""), [postId]);
  const aiDraftKey = useMemo(() => (pid ? `paperflow.post.ai.draft.${pid}` : ""), [pid]);

  const { state, reload } = useAsyncData<DetailData>(
    async (signal) => {
      if (!pid) return { post: null, comments: [] };
      const [p, c] = await Promise.all([apiGetPost(pid, accessToken, signal), apiListComments(pid, 1, 50, signal)]);
      return { post: p, comments: c.items };
    },
    [pid, accessToken]
  );
  useEffect(() => {
    if (!aiDraftKey) return;
    try {
      const raw = localStorage.getItem(aiDraftKey);
      if (!raw) {
        setAiInput("");
        setAiReferences([]);
        setAiMessages([aiWelcomeMessage]);
        return;
      }
      const parsed = JSON.parse(raw) as { input?: string; model?: PathfinderModel; references?: string[]; messages?: AiMessage[] };
      setAiInput(parsed.input ?? "");
      setAiModel(parsed.model === "glm-z1-flash" ? "glm-z1-flash" : "glm-4-flash");
      setAiReferences(Array.isArray(parsed.references) ? parsed.references.filter((it) => typeof it === "string") : []);
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        setAiMessages(parsed.messages.slice(-30));
      } else {
        setAiMessages([aiWelcomeMessage]);
      }
    } catch {
      setAiMessages([aiWelcomeMessage]);
    }
  }, [aiDraftKey]);

  useEffect(() => {
    if (!aiDraftKey) return;
    try {
      const payload = JSON.stringify({
        input: aiInput,
        model: aiModel,
        references: aiReferences.slice(0, 8),
        messages: aiMessages.slice(-30)
      });
      localStorage.setItem(aiDraftKey, payload);
    } catch {
    }
  }, [aiDraftKey, aiInput, aiModel, aiReferences, aiMessages]);

  if (!pid) {
    return (
      <Page title="帖子详情" subtitle="缺少 postId。">
        <Card>
          <div>请从帖子列表进入详情页。</div>
        </Card>
      </Page>
    );
  }

  const post = state.data?.post ?? null;
  const comments = state.data?.comments ?? [];
  const paperMeta = post ? resolvePaperPdf(post.postId) : null;
  const canFavorite = auth.state.status === "authenticated" && !!post;
  const favorited = post?.favorited === true;
  const clipReference = (text: string, max = 44) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max)}…`;
  };
  const hideSelectionPopover = () => {
    setSelectionPopover(null);
  };
  const clearCurrentSelection = () => {
    window.getSelection()?.removeAllRanges();
  };
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
    if (!(ancestor instanceof Element) || !articleBodyRef.current?.contains(ancestor)) {
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
    setAiReferences((prev) => {
      if (prev.includes(selectionPopover.text)) return prev;
      return [...prev, selectionPopover.text];
    });
    hideSelectionPopover();
    clearCurrentSelection();
  };
  const translateSelectionToChat = async () => {
    if (!selectionPopover?.text) return;
    const now = Date.now();
    const selected = selectionPopover.text;
    const userMsg: AiMessage = { id: `u_translate_${now}`, role: "user", content: "请翻译这段引用。", references: [selected] };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiError(null);
    hideSelectionPopover();
    clearCurrentSelection();
    if (auth.state.status !== "authenticated") {
      setAiMessages((prev) => [...prev, { id: `a_translate_auth_${now}`, role: "assistant", content: "请先登录后再发起后端 AI 对话。", references: [selected] }]);
      return;
    }
    setAiPending(true);
    try {
      const prompt = [
        "你是 PaperFlow 阅读助手，请做高质量双语翻译。",
        `文章标题：${post?.title ?? "未知标题"}`,
        `待翻译原文：${selected}`,
        "如果原文是中文，请翻译成英文；如果原文是英文，请翻译成中文。",
        "请先给出译文，再给出一句术语说明。"
      ].join("\n\n");
      const generated = await apiGeneratePathfinderPlan(auth.state.accessToken, { goal: prompt, model: aiModel });
      const assistantMsg: AiMessage = {
        id: `a_translate_${now}`,
        role: "assistant",
        content: generated.assistantMessage || "后端已调用成功，但未返回可读译文。",
        references: [selected]
      };
      setAiMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setAiError(err);
      setAiMessages((prev) => [...prev, { id: `a_translate_err_${now}`, role: "assistant", content: "后端翻译调用失败，请稍后重试。", references: [selected] }]);
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
    const userMsg: AiMessage = { id: `u_${now}`, role: "user", content, references: refs };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiReferences([]);
    setAiError(null);
    if (auth.state.status !== "authenticated") {
      setAiMessages((prev) => [...prev, { id: `a_auth_${now}`, role: "assistant", content: "请先登录后再发起后端 AI 对话。" }]);
      return;
    }
    setAiPending(true);
    try {
      const contextPost = post?.content ? post.content.slice(0, 5000) : "";
      const contextRefs = refs?.length ? refs.join("\n") : "";
      const prompt = [
        "你是 PaperFlow 阅读助手，请根据文章内容回答用户问题。",
        `文章标题：${post?.title ?? "未知标题"}`,
        contextPost ? `文章正文（节选）：\n${contextPost}` : "",
        contextRefs ? `用户引用片段：\n${contextRefs}` : "",
        `用户问题：${content}`,
        "请输出：1) 核心结论 2) 关键依据 3) 下一步建议。"
      ]
        .filter(Boolean)
        .join("\n\n");
      const generated = await apiGeneratePathfinderPlan(auth.state.accessToken, { goal: prompt, model: aiModel });
      let assistantContent = generated.assistantMessage || "后端已调用成功，但未返回可读回答。";
      if (assistantContent.trim() === content.trim()) {
        const steps = (generated.focus ?? []).slice(0, 3).map((f, idx) => `${idx + 1}. ${f}`).join("\n");
        assistantContent = steps ? `核心要点：\n${steps}\n\n建议：先从第 1 点入手，再逐步展开。` : "我已理解你的问题，请给我一个更具体方向，例如“按三点总结并给行动建议”。";
      }
      const assistantMsg: AiMessage = {
        id: `a_${now}`,
        role: "assistant",
        content: assistantContent,
        references: refs
      };
      setAiMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setAiError(err);
      setAiMessages((prev) => [...prev, { id: `a_err_${now}`, role: "assistant", content: "后端 AI 调用失败，请稍后重试。" }]);
    } finally {
      setAiPending(false);
    }
  };

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (selectionPopoverRef.current?.contains(target)) return;
      if (articleBodyRef.current?.contains(target)) return;
      hideSelectionPopover();
    };
    const onResize = () => hideSelectionPopover();
    const onScroll = () => hideSelectionPopover();
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  return (
    <Page
      title="帖子详情"
      subtitle={
        <span>
          <Link to="/posts">← 返回列表</Link>
        </span>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}

      {post ? (
        <div className="pf-reading-layout">
          <Card className="pf-reading-main">
            <div className="pf-article">
              <div className="pf-article__cover" />
              <div className="pf-article__icon">{sourceMeta(post.source).icon}</div>
              <h1 className="pf-article__title">{post.title}</h1>
              <div className="pf-meta" style={{ marginTop: 10 }}>
                <span className="pf-pill">{sourceMeta(post.source).label}</span>
                <span className="pf-meta__dot" />
                <span>{formatDateTime(post.publishedAt)}</span>
                <span className="pf-meta__dot" />
                <span>{readingTimeMinutes(post.content)} min read</span>
                {post.lastViewedAt ? (
                  <>
                    <span className="pf-meta__dot" />
                    <span className="pf-muted2">last viewed {formatDateTime(post.lastViewedAt)}</span>
                  </>
                ) : null}
              </div>
              {auth.state.status === "authenticated" ? (
                <div className="pf-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <Button
                    onClick={async () => {
                      if (auth.state.status !== "authenticated" || !post) return;
                      try {
                        if (favorited) {
                          await apiUnfavoritePost(auth.state.accessToken, post.postId);
                        } else {
                          await apiFavoritePost(auth.state.accessToken, post.postId);
                        }
                        reload();
                      } catch (e) {
                        setSubmitError(e);
                      }
                    }}
                    disabled={!canFavorite}
                  >
                    {favorited ? "取消收藏" : "收藏"}
                  </Button>
                </div>
              ) : (
                <div className="pf-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <span className="pf-muted2">登录后可收藏与记录足迹</span>
                </div>
              )}
              <div
                ref={articleBodyRef}
                className="pf-article-selectable"
                onMouseUp={() => window.setTimeout(updateSelectionPopover, 0)}
                onKeyUp={() => window.setTimeout(updateSelectionPopover, 0)}
                onTouchEnd={() => window.setTimeout(updateSelectionPopover, 0)}
              >
                <RichText text={post.content} />
              </div>
              {paperMeta ? (
                <div className="pf-paper-entry">
                  <span className="pf-muted2">延伸阅读论文</span>
                  <Link
                    className="pf-paper-entry__link"
                    to={`/papers/${encodeURIComponent(post.postId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开 PDF：{paperMeta.title}
                  </Link>
                </div>
              ) : null}
            </div>
          </Card>
          <Card className="pf-ai-panel">
            <div className="pf-ai-panel__head">
              <div>
                <h3>AI 对话</h3>
                <div className="pf-muted2">基于当前文章内容辅助阅读</div>
              </div>
              <span className="pf-pill">Beta</span>
            </div>
            <div className="pf-ai-chatlog">
              {aiMessages.map((msg) => (
                <div key={msg.id} className={["pf-ai-chatmsg", msg.role === "user" ? "pf-ai-chatmsg--user" : "pf-ai-chatmsg--assistant"].join(" ")}>
                  {msg.references?.length ? (
                    <div className="pf-ai-msgrefs">
                      {msg.references.map((ref) => (
                        <span key={`${msg.id}_${ref}`} className="pf-ai-refchip">🔖 {clipReference(ref)}</span>
                      ))}
                    </div>
                  ) : null}
                  {msg.role === "assistant" ? <AiMarkdown content={msg.content} /> : msg.content}
                </div>
              ))}
            </div>
            <div className="pf-ai-composer">
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
              {aiReferences.length ? (
                <div className="pf-ai-refdock">
                  {aiReferences.map((ref) => (
                    <span key={ref} className="pf-ai-refchip">
                      🔖 {clipReference(ref)}
                      <button
                        type="button"
                        className="pf-ai-refchip__remove"
                        onClick={() => setAiReferences((prev) => prev.filter((it) => it !== ref))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendAiMessage();
                  }
                }}
                rows={3}
                className="pf-textarea"
                placeholder="向 AI 提问，或先在正文中选中内容后点“添加到对话”"
              />
              <div className="pf-row" style={{ justifyContent: "space-between" }}>
                <span className="pf-muted2">Shift+Enter 换行</span>
                <Button
                  variant="primary"
                  onClick={sendAiMessage}
                    disabled={aiPending || (!aiInput.trim() && aiReferences.length === 0)}
                >
                  {aiPending ? "发送中..." : "发送"}
                </Button>
              </div>
              {aiError ? <ErrorState error={aiError} title="AI 调用失败" /> : null}
            </div>
          </Card>
        </div>
      ) : null}
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

      <Card>
        <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
          <h3>评论</h3>
          <div className="pf-muted2">
            展示：APPROVED；创建：{post?.commentModerationEnabled === false ? "APPROVED（即时发布）" : "PENDING（需管理员审核）"}
          </div>
        </div>

        <div className="pf-grid" style={{ marginTop: 12 }}>
          {comments.length === 0 ? <EmptyState>暂无评论</EmptyState> : null}
          {comments.map((c) => (
            <div key={c.commentId} style={{ paddingTop: 10, borderTop: "1px solid rgba(55, 53, 47, 0.08)" }}>
              <div className="pf-row pf-row--baseline" style={{ flexWrap: "wrap" }}>
                <span className="pf-muted2">user={c.userId}</span>
                <span className="pf-muted2">{new Date(c.createdAt).toLocaleString()}</span>
                <span className="pf-muted2">status={c.status}</span>
              </div>
              <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{c.content}</div>
            </div>
          ))}
        </div>

        <div className="pf-divider" style={{ marginTop: 16, paddingTop: 12 }}>
          <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
            <h3>发表评论</h3>
            {auth.state.status !== "authenticated" ? <span className="pf-muted2">需要登录后才能发表评论</span> : null}
          </div>

          {auth.state.status !== "authenticated" ? (
            <Alert tone="warning" title="需要登录">
              <Link to="/login">去登录</Link>
            </Alert>
          ) : (
            <div className="pf-grid" style={{ gap: 10, marginTop: 10 }}>
              {submitError ? <ErrorState error={submitError} title="提交失败" /> : null}
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={4}
                className="pf-textarea"
                placeholder="写下你的评论…"
              />
              <div className="pf-row" style={{ justifyContent: "flex-end" }}>
                <Button
                  variant="primary"
                  onClick={async () => {
                    if (auth.state.status !== "authenticated") return;
                    const content = commentText.trim();
                    if (!content) return;
                    setSubmitting(true);
                    setSubmitError(null);
                    try {
                      await apiCreateComment(auth.state.accessToken, pid, content);
                      setCommentText("");
                      reload();
                    } catch (e) {
                      setSubmitError(e);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting || !commentText.trim()}
                >
                  {submitting ? "提交中..." : post?.commentModerationEnabled === false ? "提交（即时发布）" : "提交（进入待审核）"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </Page>
  );
}
