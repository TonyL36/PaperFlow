import { useCallback, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiAiChat } from "../../data/api";
import type { PathfinderModel, Post } from "../../data/types";

export type AiMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  references?: string[];
};

type UsePaperReaderChatArgs = {
  paperTitle: string;
  post: Post | null;
};

type UsePaperReaderChatResult = {
  input: string;
  model: PathfinderModel;
  pending: boolean;
  error: unknown | null;
  references: string[];
  messages: AiMessage[];
  setInput: (value: string) => void;
  setModel: (value: PathfinderModel) => void;
  appendReference: (snippet: string) => void;
  removeReference: (snippet: string) => void;
  translateReferenceToChat: (snippet: string) => Promise<void>;
  sendAiMessage: () => Promise<void>;
};

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

export function usePaperReaderChat(args: UsePaperReaderChatArgs): UsePaperReaderChatResult {
  const { paperTitle, post } = args;
  const auth = useAuth();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<PathfinderModel>("glm-4-flash");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [references, setReferences] = useState<string[]>([]);
  const [messages, setMessages] = useState<AiMessage[]>([
    { id: "pdf_welcome", role: "assistant", content: "你好，我会结合左侧论文 PDF 帮你做总结、问答与术语解释。" }
  ]);

  const appendReference = useCallback((snippet: string) => {
    setReferences((prev) => (prev.includes(snippet) ? prev : [...prev, snippet]));
  }, []);

  const removeReference = useCallback((snippet: string) => {
    setReferences((prev) => prev.filter((it) => it !== snippet));
  }, []);

  const translateReferenceToChat = useCallback(async (snippet: string) => {
    const now = Date.now();
    const refPreview = toReferencePreview(snippet);
    const userMsg: AiMessage = { id: `pdf_u_translate_${now}`, role: "user", content: "请翻译这段引用。", references: [refPreview] };
    setMessages((prev) => [...prev, userMsg]);
    setError(null);
    if (auth.state.status !== "authenticated") {
      setMessages((prev) => [...prev, { id: `pdf_a_translate_auth_${now}`, role: "assistant", content: "请先登录后再发起后端 AI 对话。", references: [refPreview] }]);
      return;
    }
    setPending(true);
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
        model,
        systemPrompt: "你是翻译助手。",
        userPrompt: primaryPrompt
      });
      const finalText = normalizeAssistantAnswer(normalizeTranslationResponse(generated.assistantMessage || ""));
      setMessages((prev) => [
        ...prev,
        { id: `pdf_a_translate_${now}`, role: "assistant", content: finalText, references: [refPreview] }
      ]);
    } catch (err) {
      setError(err);
      setMessages((prev) => [...prev, { id: `pdf_a_translate_err_${now}`, role: "assistant", content: "后端翻译调用失败，请稍后重试。", references: [refPreview] }]);
    } finally {
      setPending(false);
    }
  }, [auth.state, model, paperTitle, post]);

  const sendAiMessage = useCallback(async () => {
    const raw = input.trim();
    const content = raw || (references.length ? "请基于引用内容进行解读。" : "");
    if (!content || pending) return;
    const now = Date.now();
    const refs = references.length ? references : undefined;
    const userMsg: AiMessage = { id: `pdf_u_${now}`, role: "user", content, references: refs };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setReferences([]);
    setError(null);
    if (auth.state.status !== "authenticated") {
      setMessages((prev) => [...prev, { id: `pdf_a_auth_${now}`, role: "assistant", content: "请先登录后再发起后端 AI 对话。" }]);
      return;
    }
    setPending(true);
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
        model,
        systemPrompt: "你是 PaperFlow 论文阅读助手。",
        userPrompt: prompt
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `pdf_a_${now}`,
          role: "assistant",
          content: normalizeAssistantAnswer(generated.assistantMessage || ""),
          references: refs
        }
      ]);
    } catch (err) {
      setError(err);
      setMessages((prev) => [...prev, { id: `pdf_a_err_${now}`, role: "assistant", content: "后端 AI 调用失败，请稍后重试。" }]);
    } finally {
      setPending(false);
    }
  }, [auth.state, input, model, paperTitle, pending, post, references]);

  return {
    input,
    model,
    pending,
    error,
    references,
    messages,
    setInput,
    setModel,
    appendReference,
    removeReference,
    translateReferenceToChat,
    sendAiMessage
  };
}
