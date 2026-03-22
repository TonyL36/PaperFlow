import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { Button } from "../components/Button";
import { apiGetPost } from "../data/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { resolvePaperPdf } from "../utils/paper";

type AiMessage = { id: string; role: "assistant" | "user"; content: string };

export function PaperPdfReaderPage() {
  const { postId } = useParams();
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    { id: "pdf_welcome", role: "assistant", content: "你好，我会结合左侧论文 PDF 帮你做总结、问答与术语解释。" }
  ]);

  const pid = useMemo(() => (postId ? decodeURIComponent(postId) : ""), [postId]);
  const { state, reload } = useAsyncData(async (signal) => {
    if (!pid) return null;
    return apiGetPost(pid, signal);
  }, [pid]);

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

  const sendAiMessage = () => {
    const content = aiInput.trim();
    if (!content) return;
    const now = Date.now();
    const userMsg: AiMessage = { id: `pdf_u_${now}`, role: "user", content };
    const assistantMsg: AiMessage = {
      id: `pdf_a_${now}`,
      role: "assistant",
      content: `已收到你的问题：“${content}”。我会结合论文 ${paperMeta.title} 给出结构化解读与下一步建议。`
    };
    setAiMessages((prev) => [...prev, userMsg, assistantMsg]);
    setAiInput("");
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
                {msg.content}
              </div>
            ))}
          </div>
          <div className="pf-ai-composer">
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
              <Button variant="primary" onClick={sendAiMessage} disabled={!aiInput.trim()}>
                发送
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
