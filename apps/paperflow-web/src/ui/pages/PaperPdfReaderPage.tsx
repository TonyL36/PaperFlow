import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AiMarkdown } from "../components/AiMarkdown";
import { useAuth } from "../auth/AuthContext";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { Button } from "../components/Button";
import { apiGeneratePathfinderPlan, apiGetPost } from "../data/api";
import type { PathfinderModel } from "../data/types";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { resolvePaperPdf } from "../utils/paper";

type AiMessage = { id: string; role: "assistant" | "user"; content: string };

export function PaperPdfReaderPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : undefined;
  const { postId } = useParams();
  const [aiInput, setAiInput] = useState("");
  const [aiModel, setAiModel] = useState<PathfinderModel>("glm-4-flash");
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState<unknown | null>(null);
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

  const sendAiMessage = async () => {
    const content = aiInput.trim();
    if (!content || aiPending) return;
    const now = Date.now();
    const userMsg: AiMessage = { id: `pdf_u_${now}`, role: "user", content };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiError(null);
    if (auth.state.status !== "authenticated") {
      setAiMessages((prev) => [...prev, { id: `pdf_a_auth_${now}`, role: "assistant", content: "请先登录后再发起后端 AI 对话。" }]);
      return;
    }
    setAiPending(true);
    try {
      const prompt = [
        "你是 PaperFlow 论文阅读助手，请根据论文标题与文章上下文回答用户问题。",
        `论文标题：${paperMeta.title}`,
        post ? `来源文章标题：${post.title}` : "",
        post?.content ? `来源文章正文（节选）：\n${post.content.slice(0, 5000)}` : "",
        `用户问题：${content}`,
        "请输出：1) 结论 2) 关键依据 3) 后续阅读建议。"
      ]
        .filter(Boolean)
        .join("\n\n");
      const generated = await apiGeneratePathfinderPlan(auth.state.accessToken, { goal: prompt, model: aiModel });
      setAiMessages((prev) => [
        ...prev,
        {
          id: `pdf_a_${now}`,
          role: "assistant",
          content: generated.assistantMessage || "后端已调用成功，但未返回可读回答。"
        }
      ]);
    } catch (err) {
      setAiError(err);
      setAiMessages((prev) => [...prev, { id: `pdf_a_err_${now}`, role: "assistant", content: "后端 AI 调用失败，请稍后重试。" }]);
    } finally {
      setAiPending(false);
    }
  };

  return (
    <Page
      title="论文阅读"
      subtitle={
        <span>
          <Link to={`/posts/${encodeURIComponent(pid)}`}>← 返回文章详情</Link>
        </span>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      <div className="pf-pdf-layout">
        <Card className="pf-pdf-main">
          <div className="pf-pdf-header">
            <h3>{paperMeta.title}</h3>
            <div className="pf-muted2">{post ? `来源文章：${post.title}` : "来源文章加载中..."}</div>
            <a href={paperMeta.pdfUrl} target="_blank" rel="noopener noreferrer">
              在新标签页打开原始 PDF
            </a>
          </div>
          <iframe title={paperMeta.title} src={paperMeta.pdfUrl} className="pf-pdf-frame" />
        </Card>
        <Card className="pf-ai-panel">
          <div className="pf-ai-panel__head">
            <div>
              <h3>AI 对话</h3>
              <div className="pf-muted2">结合论文内容辅助阅读</div>
            </div>
            <span className="pf-pill">Beta</span>
          </div>
          <div className="pf-ai-chatlog">
            {aiMessages.map((msg) => (
              <div key={msg.id} className={["pf-ai-chatmsg", msg.role === "user" ? "pf-ai-chatmsg--user" : "pf-ai-chatmsg--assistant"].join(" ")}>
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
              placeholder="向 AI 提问这篇论文内容"
            />
            <div className="pf-row" style={{ justifyContent: "space-between" }}>
              <span className="pf-muted2">Shift+Enter 换行</span>
              <Button variant="primary" onClick={sendAiMessage} disabled={aiPending || !aiInput.trim()}>
                {aiPending ? "发送中..." : "发送"}
              </Button>
            </div>
            {aiError ? <ErrorState error={aiError} title="AI 调用失败" /> : null}
          </div>
        </Card>
      </div>
    </Page>
  );
}
