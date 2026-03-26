import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { AiMarkdown } from "../components/AiMarkdown";
import {
  apiFavoritePathfinderSession,
  apiGeneratePathfinderPlan,
  apiListPathfinderSessions,
  apiUnfavoritePathfinderSession,
  apiUpsertPathfinderSession
} from "../data/api";
import type { PathfinderMessage, PathfinderModel, PathfinderSession, PathfinderStage, PathfinderStageStatus } from "../data/types";
import { Page } from "../layout/Page";

type ChatMessage = PathfinderMessage;
type StageStatus = PathfinderStageStatus;
type Stage = PathfinderStage;
type PathfinderPlan = { sessionId: string; goal: string; model: PathfinderModel; focus: string[]; stages: Stage[]; favorited: boolean };
const defaultModel: PathfinderModel = "glm-4-flash";

const welcomeMessage: ChatMessage = {
  id: "path_welcome",
  role: "assistant",
  content: "你好，我是 Pathfinder。告诉我你的学习目标，我会为你拆解阶段路线与闯关节点。"
};

const stageStatusLabel: Record<StageStatus, string> = {
  done: "已完成",
  in_progress: "进行中",
  locked: "待解锁"
};

const stageStatusEmoji: Record<StageStatus, string> = {
  done: "✅",
  in_progress: "🟡",
  locked: "⚪"
};

export function PathfinderPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [goalInput, setGoalInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<PathfinderModel>(defaultModel);
  const [lastGoal, setLastGoal] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [plan, setPlan] = useState<PathfinderPlan | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [isFavoritePending, setIsFavoritePending] = useState(false);
  const [historySessions, setHistorySessions] = useState<PathfinderSession[]>([]);

  const progress = useMemo(() => {
    if (!plan) return { doneStages: 0, totalStages: 0, doneReadings: 0, totalReadings: 0, percent: 0 };
    const totalStages = plan.stages.length;
    const doneStages = plan.stages.filter((s) => s.status === "done").length;
    const totalReadings = plan.stages.reduce((sum, s) => sum + s.readings.length, 0);
    const doneReadings = plan.stages.reduce((sum, s) => sum + s.readings.filter((r) => r.done).length, 0);
    return {
      doneStages,
      totalStages,
      doneReadings,
      totalReadings,
      percent: totalReadings ? Math.round((doneReadings / totalReadings) * 100) : 0
    };
  }, [plan]);

  const activeStage = useMemo(() => {
    if (!plan || !activeStageId) return null;
    return plan.stages.find((stage) => stage.id === activeStageId) ?? null;
  }, [plan, activeStageId]);

  useEffect(() => {
    if (!plan) return;
    const stageParam = searchParams.get("stage");
    if (!stageParam) return;
    if (plan.stages.some((stage) => stage.id === stageParam) && stageParam !== activeStageId) {
      setActiveStageId(stageParam);
    }
  }, [plan, searchParams, activeStageId]);

  useEffect(() => {
    if (!accessToken) {
      setHistorySessions([]);
      setHistoryError(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    void (async () => {
      try {
        const data = await apiListPathfinderSessions(accessToken, 1, 20);
        if (cancelled) return;
        const items = data.items ?? [];
        setHistorySessions(items);
        const sid = searchParams.get("sid");
        if (!sid) {
          return;
        }
        const picked = items.find((it) => it.sessionId === sid);
        if (!picked) {
          return;
        }
        hydrateSession(picked, searchParams.get("stage"));
      } catch (err) {
        if (cancelled) return;
        setHistoryError(err);
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const syncPathStage = (nextPlan: PathfinderPlan, nextStageId: string) => {
    setSearchParams({ sid: nextPlan.sessionId, stage: nextStageId }, { replace: true });
  };

  const hydrateSession = (session: PathfinderSession, preferredStageId?: string | null) => {
    const nextPlan: PathfinderPlan = {
      sessionId: session.sessionId,
      goal: session.goal,
      model: session.model ?? defaultModel,
      focus: session.focus ?? [],
      stages: session.stages ?? [],
      favorited: session.favorited
    };
    const nextMessages = session.messages?.length ? session.messages : [welcomeMessage];
    const nextStageId = pickCurrentStageId(nextPlan.stages, preferredStageId ?? session.activeStageId ?? null);
    setPlan(nextPlan);
    setSelectedModel(nextPlan.model);
    setMessages(nextMessages);
    setActiveStageId(nextStageId);
    syncPathStage(nextPlan, nextStageId);
  };

  const mergeHistorySession = (session: PathfinderSession) => {
    setHistorySessions((prev) => {
      const rest = prev.filter((it) => it.sessionId !== session.sessionId);
      return [session, ...rest];
    });
  };

  const persistSession = async (nextPlan: PathfinderPlan, nextMessages: ChatMessage[], nextStageId: string) => {
    if (!accessToken) {
      return;
    }
    setIsSyncing(true);
    setSaveError(null);
    try {
      const saved = await apiUpsertPathfinderSession(accessToken, nextPlan.sessionId, {
        goal: nextPlan.goal,
        model: nextPlan.model,
        focus: nextPlan.focus,
        stages: nextPlan.stages,
        messages: nextMessages,
        activeStageId: nextStageId
      });
      mergeHistorySession(saved);
      setPlan((prev) => (prev && prev.sessionId === saved.sessionId ? { ...prev, favorited: saved.favorited, model: saved.model } : prev));
    } catch (err) {
      setSaveError(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const generateAssistantFeedback = async (
    nextPlan: PathfinderPlan,
    nextStageId: string,
    prompt: string,
    fallback: string,
    messageId: string
  ) => {
    let assistantContent = fallback;
    if (accessToken) {
      try {
        const generated = await apiGeneratePathfinderPlan(accessToken, { goal: prompt, model: nextPlan.model });
        if (generated.assistantMessage?.trim()) {
          assistantContent = generated.assistantMessage.trim();
        }
      } catch {
      }
    }
    const assistantMessage: ChatMessage = { id: messageId, role: "assistant", content: assistantContent };
    const nextMessages: ChatMessage[] = [...messages, assistantMessage];
    setMessages(nextMessages);
    void persistSession(nextPlan, nextMessages, nextStageId);
  };

  const submitGoal = async (goalOverride?: string) => {
    const goal = (goalOverride ?? goalInput).trim();
    if (!goal || isGenerating || !accessToken) return;
    setGenerateError(null);
    setIsGenerating(true);
    setLastGoal(goal);
    const now = Date.now();
    const userMessage: ChatMessage = { id: `path_u_${now}`, role: "user", content: goal };
    const beforeAssistant = [...messages, userMessage];
    setMessages(beforeAssistant);
    try {
      const requestGoal = plan ? buildPlanUpdatePrompt(plan, goal, messages) : goal;
      const generated = await apiGeneratePathfinderPlan(accessToken, { goal: requestGoal, model: selectedModel });
      const nextPlan: PathfinderPlan = {
        sessionId: plan?.sessionId ?? createSessionId(),
        goal,
        model: generated.model,
        focus: generated.focus ?? [],
        stages: recalculateStageStatus(generated.stages ?? []),
        favorited: plan?.favorited ?? false
      };
      const nextStageId = pickCurrentStageId(nextPlan.stages, null);
      const assistantMessage: ChatMessage = {
        id: `path_a_${now}`,
        role: "assistant",
        content: generated.assistantMessage
      };
      const nextMessages = [...beforeAssistant, assistantMessage];
      setPlan(nextPlan);
      setMessages(nextMessages);
      setActiveStageId(nextStageId);
      syncPathStage(nextPlan, nextStageId);
      await persistSession(nextPlan, nextMessages, nextStageId);
      setGoalInput("");
    } catch (err) {
      setGenerateError(err);
      if (!plan) {
        setPlan(null);
        setActiveStageId(null);
        setSearchParams({}, { replace: true });
      }
      setMessages((prev) => [
        ...prev,
        { id: `path_e_${now}`, role: "assistant", content: "路径生成失败，你可以稍后重试或调整目标描述。" }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const onSelectStage = (stageId: string) => {
    if (!plan) return;
    setActiveStageId(stageId);
    syncPathStage(plan, stageId);
    const now = Date.now();
    const fallback = `已切换到「${stageTitleById(plan.stages, stageId)}」，当前状态：${stageStatusLabel[stageById(plan.stages, stageId)?.status ?? "locked"]}。`;
    const prompt = [
      "你是 Pathfinder 学习助手，请基于当前阶段给出一句精炼学习提示。",
      `学习总目标：${plan.goal}`,
      `已切换阶段：${stageTitleById(plan.stages, stageId)}`,
      `阶段状态：${stageStatusLabel[stageById(plan.stages, stageId)?.status ?? "locked"]}`,
      "请输出一段可执行的下一步建议。"
    ].join("\n\n");
    void generateAssistantFeedback(plan, stageId, prompt, fallback, `path_s_${now}`);
  };

  const onToggleReading = (stageId: string, readingId: string) => {
    if (!plan) return;
    const currentStage = stageById(plan.stages, stageId);
    if (!currentStage || currentStage.status === "locked") return;
    const reading = currentStage.readings.find((item) => item.id === readingId);
    if (!reading) return;
    const nextStages = recalculateStageStatus(
      plan.stages.map((stage) =>
        stage.id === stageId
          ? {
              ...stage,
              readings: stage.readings.map((item) => (item.id === readingId ? { ...item, done: !item.done } : item))
            }
          : stage
      )
    );
    const nextPlan: PathfinderPlan = { ...plan, stages: nextStages };
    const nextActiveStageId = pickCurrentStageId(nextStages, activeStageId);
    const nextProgress = calcProgress(nextPlan);
    const now = Date.now();
    setPlan(nextPlan);
    setActiveStageId(nextActiveStageId);
    syncPathStage(nextPlan, nextActiveStageId);
    const fallback = `${reading.done ? "已撤销" : "已完成"}「${reading.title}」。阅读进度 ${nextProgress.doneReadings}/${nextProgress.totalReadings}，关卡进度 ${nextProgress.doneStages}/${nextProgress.totalStages}。`;
    const prompt = [
      "你是 Pathfinder 学习助手，请根据最新进度给出一句下一步建议。",
      `学习总目标：${nextPlan.goal}`,
      `本次动作：${reading.done ? "撤销完成" : "标记完成"}「${reading.title}」`,
      `阅读进度：${nextProgress.doneReadings}/${nextProgress.totalReadings}`,
      `关卡进度：${nextProgress.doneStages}/${nextProgress.totalStages}`,
      "请输出一段简短可执行建议。"
    ].join("\n\n");
    void generateAssistantFeedback(nextPlan, nextActiveStageId, prompt, fallback, `path_p_${now}`);
  };

  const onToggleFavorite = async () => {
    if (!accessToken || !plan || isFavoritePending) return;
    setIsFavoritePending(true);
    setSaveError(null);
    try {
      const saved = plan.favorited
        ? await apiUnfavoritePathfinderSession(accessToken, plan.sessionId)
        : await apiFavoritePathfinderSession(accessToken, plan.sessionId);
      mergeHistorySession(saved);
      setPlan((prev) => (prev && prev.sessionId === saved.sessionId ? { ...prev, favorited: saved.favorited, model: saved.model } : prev));
    } catch (err) {
      setSaveError(err);
    } finally {
      setIsFavoritePending(false);
    }
  };

  const onLoadHistorySession = (session: PathfinderSession) => {
    setGenerateError(null);
    setSaveError(null);
    hydrateSession(session, null);
  };

  const onNewConversation = () => {
    setPlan(null);
    setActiveStageId(null);
    setGenerateError(null);
    setSaveError(null);
    setMessages([welcomeMessage]);
    setGoalInput("");
    setSearchParams({}, { replace: true });
  };

  return (
    <Page title="Pathfinder 学习路径" subtitle="类 GPT 交互式学习目标规划：输入目标，生成分阶段闯关路径。">
      <div className="pf-pathfinder-layout">
        <div className="pf-pathfinder-history">
          <Card>
            <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
              <h3>历史会话</h3>
              <span className="pf-muted2">最近 20 条</span>
            </div>
            {!accessToken ? <EmptyState>登录后可读取历史会话。</EmptyState> : null}
            {historyLoading ? <Spinner label="加载历史会话..." /> : null}
            {historyError ? <ErrorState error={historyError} title="历史读取失败" /> : null}
            {accessToken && !historyLoading && !historyError ? (
              <div className="pf-grid" style={{ gap: 6, marginTop: 8 }}>
                {historySessions.length === 0 ? <EmptyState>暂无历史会话</EmptyState> : null}
                {historySessions.map((item) => (
                  <button
                    key={item.sessionId}
                    type="button"
                    className={["pf-pathfinder-history-item", plan?.sessionId === item.sessionId ? "pf-pathfinder-history-item--active" : null].filter(Boolean).join(" ")}
                    onClick={() => onLoadHistorySession(item)}
                  >
                    <div className="pf-pathfinder-history-item__title">{formatGoalText(item.goal)}</div>
                    <div className="pf-row" style={{ justifyContent: "space-between", gap: 6, marginTop: 4 }}>
                      <span className="pf-muted2">{item.model}</span>
                      <span>{item.favorited ? "⭐" : "☆"}</span>
                    </div>
                    <div className="pf-muted2" style={{ marginTop: 4 }}>会话 {item.sessionId}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
        <Card className="pf-pathfinder-chat">
          <div className="pf-ai-panel__head">
            <div>
              <h3>Pathfinder 对话</h3>
              <div className="pf-muted2">
                {plan ? `会话 ${plan.sessionId} · 当前阶段 ${activeStage ? activeStage.title : "未选择"}` : "输入学习目标，生成阶段路线"}
              </div>
            </div>
            <div className="pf-row pf-pathfinder-actions" style={{ gap: 6 }}>
              <Button variant="primary" onClick={onNewConversation} disabled={isGenerating || isSyncing}>
                新对话
              </Button>
              {plan ? (
                <Button onClick={onToggleFavorite} disabled={!accessToken || isFavoritePending || isSyncing}>
                  {plan.favorited ? "★ 已收藏" : "☆ 收藏会话"}
                </Button>
              ) : null}
              <span className="pf-pill">Beta</span>
            </div>
          </div>
          <div className="pf-ai-chatlog">
            {messages.map((msg) => (
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
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as PathfinderModel)}
                disabled={isGenerating}
              >
                <option value="glm-4-flash">glm-4-flash</option>
                <option value="glm-z1-flash">glm-z1-flash</option>
              </select>
            </div>
            <textarea
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitGoal();
                }
              }}
              rows={3}
              className="pf-textarea"
              disabled={isGenerating}
              placeholder="例如：两周内掌握 RAG 系统设计并能完成最小可运行项目"
            />
            <div className="pf-row" style={{ justifyContent: "space-between" }}>
              <span className="pf-muted2">
                {accessToken ? (isSyncing ? "正在同步到后端..." : "已登录，模型调用与会话将由后端处理") : "请先登录后再生成路径"}
              </span>
              <Button variant="primary" onClick={() => void submitGoal()} disabled={!goalInput.trim() || isGenerating || !accessToken}>
                {isGenerating ? "处理中..." : plan ? "修改当前计划" : "生成学习路径"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="pf-pathfinder-result">
          <Card className="pf-pathfinder-nodes">
            <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
              <h3>闯关节点</h3>
              <span className="pf-muted2">阶段可视化</span>
            </div>
            {isGenerating ? (
              <div style={{ marginTop: 10 }}>
                <Spinner label="节点生成中..." />
              </div>
            ) : plan ? (
              <div className="pf-stage-track">
                {plan.stages.map((stage, index) => (
                  <button
                    key={stage.id}
                    type="button"
                    className={["pf-stage-node", activeStageId === stage.id ? "pf-stage-node--active" : null].filter(Boolean).join(" ")}
                    onClick={() => onSelectStage(stage.id)}
                  >
                    <div className={["pf-stage-node__dot", `pf-stage-node__dot--${stage.status}`].join(" ")}>{index + 1}</div>
                    <div className="pf-stage-node__meta">
                      <div className="pf-row" style={{ gap: 6 }}>
                        <span>{stageStatusEmoji[stage.status]}</span>
                        <strong>{stage.title}</strong>
                      </div>
                      <div className="pf-muted2">
                        {stageStatusLabel[stage.status]} · 预计 {stage.etaDays} 天
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState>暂无节点数据</EmptyState>
            )}
          </Card>

          <Card className="pf-pathfinder-overview">
            <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
              <h3>路径结果</h3>
              {plan ? <span className="pf-pill">已生成</span> : <span className="pf-pill">等待输入</span>}
            </div>
            {isGenerating ? (
              <div style={{ marginTop: 8 }}>
                <Spinner label="正在生成学习路径..." />
              </div>
            ) : generateError ? (
              <div style={{ marginTop: 10 }}>
                <ErrorState
                  error={generateError}
                  title="路径生成失败"
                  hint="可重试或将目标描述改得更具体。"
                  onRetry={() => {
                    void submitGoal(lastGoal);
                  }}
                />
              </div>
            ) : plan ? (
              <div className="pf-grid" style={{ gap: 8, marginTop: 8 }}>
                <div className="pf-muted2">目标：{formatGoalText(plan.goal)}</div>
                <div className="pf-muted2">模型：{plan.model}</div>
                <div className="pf-muted2">收藏状态：{plan.favorited ? "已收藏" : "未收藏"}</div>
                <div className="pf-row" style={{ flexWrap: "wrap", gap: 6 }}>
                  {plan.focus.map((f) => (
                    <span key={f} className="pf-ai-refchip">
                      🎯 {f}
                    </span>
                  ))}
                </div>
                <div className="pf-muted2">
                  阅读进度：{progress.doneReadings}/{progress.totalReadings}（{progress.percent}%）
                </div>
                <div className="pf-muted2">
                  闯关进度：{progress.doneStages}/{progress.totalStages}
                </div>
              </div>
            ) : (
              <EmptyState>先在左侧输入学习目标，再生成路径。</EmptyState>
            )}
          </Card>

          {plan ? (
            <div className="pf-pathfinder-stages">
              <Card>
                {activeStage ? (
                  <div className="pf-grid" style={{ gap: 8 }}>
                    <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
                      <h3>
                        {stageStatusEmoji[activeStage.status]} {activeStage.title}
                      </h3>
                      <span className="pf-muted2">
                        {stageStatusLabel[activeStage.status]} · {activeStage.etaDays} 天
                      </span>
                    </div>
                    <div>{activeStage.objective}</div>
                    {activeStage.status === "locked" ? (
                      <EmptyState title="当前关卡未解锁">先完成前置关卡阅读项，系统将自动解锁下一关。</EmptyState>
                    ) : activeStage.readings.length === 0 ? (
                      <EmptyState title="当前关卡暂无阅读项">请更换学习目标重新生成路径。</EmptyState>
                    ) : (
                      <div className="pf-grid" style={{ gap: 6 }}>
                        {activeStage.readings.map((item) => (
                          <div key={item.id} className={["pf-pathfinder-reading", item.done ? "pf-pathfinder-reading--done" : null].filter(Boolean).join(" ")}>
                            <div className="pf-pathfinder-reading__main">{item.done ? "✅" : "📘"} {item.title}</div>
                            <Button onClick={() => onToggleReading(activeStage.id, item.id)}>{item.done ? "撤销完成" : "标记完成"}</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState title="暂无选中关卡">请在右上方节点区选择一个阶段。</EmptyState>
                )}
              </Card>
            </div>
          ) : null}
        </div>
      </div>
      {saveError ? <ErrorState error={saveError} title="后端同步失败" hint="当前变更已保留在前端，可稍后重试收藏或继续操作。" /> : null}
    </Page>
  );
}

function recalculateStageStatus(stages: Stage[]): Stage[] {
  let shouldUnlock = true;
  return stages.map((stage) => {
    if (!shouldUnlock) {
      return { ...stage, status: "locked" };
    }
    const doneCount = stage.readings.filter((reading) => reading.done).length;
    const isDone = stage.readings.length > 0 && doneCount === stage.readings.length;
    if (isDone) {
      return { ...stage, status: "done" };
    }
    shouldUnlock = false;
    return { ...stage, status: "in_progress" };
  });
}

function stageById(stages: Stage[], stageId: string) {
  return stages.find((stage) => stage.id === stageId) ?? null;
}

function stageTitleById(stages: Stage[], stageId: string) {
  return stageById(stages, stageId)?.title ?? "未知关卡";
}

function pickCurrentStageId(stages: Stage[], preferredId: string | null) {
  if (preferredId && stages.some((stage) => stage.id === preferredId)) {
    return preferredId;
  }
  return stages.find((stage) => stage.status === "in_progress")?.id ?? stages[0]?.id ?? "";
}

function calcProgress(nextPlan: PathfinderPlan) {
  const doneStages = nextPlan.stages.filter((s) => s.status === "done").length;
  const totalStages = nextPlan.stages.length;
  const totalReadings = nextPlan.stages.reduce((sum, s) => sum + s.readings.length, 0);
  const doneReadings = nextPlan.stages.reduce((sum, s) => sum + s.readings.filter((r) => r.done).length, 0);
  return { doneStages, totalStages, doneReadings, totalReadings };
}

function createSessionId() {
  return `PF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function buildPlanUpdatePrompt(plan: PathfinderPlan, userInput: string, history: ChatMessage[]) {
  const stageSummary = plan.stages
    .map((s, i) => `${i + 1}. ${s.title}（${s.status}，${s.etaDays}天）`)
    .join("\n");
  const recent = history.slice(-6).map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`).join("\n");
  return [
    `当前目标：${formatGoalText(plan.goal)}`,
    `当前模型：${plan.model}`,
    "当前阶段概览：",
    stageSummary || "暂无",
    recent ? `近期对话：\n${recent}` : "",
    `请基于以上内容，按我的新要求重排学习路径：${userInput}`,
    "输出仍需为可执行的阶段式学习计划。"
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGoalText(goal: string) {
  const text = goal ?? "";
  const matched = text.match(/重排学习路径：([^\n]+)/);
  const candidate = matched?.[1] ?? text;
  return candidate.replace(/\s+/g, " ").trim();
}
