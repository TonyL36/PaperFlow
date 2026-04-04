import { httpJson } from "./http";
import type {
  AdminUser,
  Comment,
  MailTemplateSettings,
  Paged,
  PaperFormat,
  PaperFormatType,
  PaperHighlight,
  PaperHighlightAnchor,
  PaperHighlightLevel,
  PathfinderModel,
  PathfinderSession,
  PathfinderStage,
  Post,
  UserProfile
} from "./types";

type LoginReq = { email: string; password: string };
type AuthResp = { accessToken: string };
type UnknownRecord = Record<string, unknown>;
const PAPER_FORMAT_SET: ReadonlySet<PaperFormatType> = new Set(["pdf", "html", "markdown"]);
const HIGHLIGHT_LEVEL_SET: ReadonlySet<PaperHighlightLevel> = new Set(["claim", "evidence", "method", "risk"]);

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function normalizePaperFormatType(value: unknown): PaperFormatType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!PAPER_FORMAT_SET.has(normalized as PaperFormatType)) {
    return null;
  }
  return normalized as PaperFormatType;
}

function normalizeHighlightLevel(value: unknown): PaperHighlightLevel {
  if (typeof value !== "string") return "method";
  const normalized = value.trim().toLowerCase();
  if (!HIGHLIGHT_LEVEL_SET.has(normalized as PaperHighlightLevel)) {
    return "method";
  }
  return normalized as PaperHighlightLevel;
}

function normalizeBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  const nums = value.map((it) => (typeof it === "number" ? it : Number.NaN));
  if (nums.some((it) => !Number.isFinite(it))) {
    return null;
  }
  return [nums[0], nums[1], nums[2], nums[3]];
}

function normalizeAnchor(value: unknown): PaperHighlightAnchor | null {
  const record = asRecord(value);
  if (!record) return null;
  const format = normalizePaperFormatType(record.format);
  if (!format) return null;
  const pageRaw = record.page;
  const quote = typeof record.quote === "string" ? record.quote : null;
  const selector = typeof record.selector === "string" ? record.selector : null;
  const page = typeof pageRaw === "number" && Number.isFinite(pageRaw) ? pageRaw : null;
  const bbox = normalizeBbox(record.bbox);
  return { format, page, bbox, quote, selector };
}

function normalizePaperFormat(value: unknown): PaperFormat | null {
  const record = asRecord(value);
  if (!record) return null;
  const type = normalizePaperFormatType(record.type);
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!type || !url) return null;
  const sha256 = typeof record.sha256 === "string" ? record.sha256 : null;
  return { type, url, sha256 };
}

function normalizePaperHighlight(value: unknown, index: number): PaperHighlight | null {
  const record = asRecord(value);
  if (!record) return null;
  const snippet = typeof record.snippet === "string" ? record.snippet.trim() : "";
  if (!snippet) return null;
  const highlightIdRaw = record.highlightId ?? record.id;
  const highlightId = typeof highlightIdRaw === "string" && highlightIdRaw.trim() ? highlightIdRaw : `h_${index + 1}`;
  const titleRaw = record.title;
  const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw : `重点 ${index + 1}`;
  return {
    highlightId,
    level: normalizeHighlightLevel(record.level),
    title,
    snippet,
    anchor: normalizeAnchor(record.anchor)
  };
}

function extractFormatsFromContent(content: string): PaperFormat[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const result: PaperFormat[] = [];
  let inFormats = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!inFormats) {
      if (/^##\s+formats\b/i.test(line)) {
        inFormats = true;
      }
      continue;
    }
    if (/^##\s+/.test(line)) {
      break;
    }
    const match = line.match(/^-\s*([A-Za-z]+)\s*:\s*(\S+)\s*$/);
    if (!match) continue;
    const type = normalizePaperFormatType(match[1]);
    const url = match[2]?.trim();
    if (!type || !url) continue;
    result.push({ type, url, sha256: null });
  }
  return result;
}

function normalizePostPaperProtocol(post: Post): Post {
  const record = post as Post & UnknownRecord;
  const rawFormats = Array.isArray(record.formats) ? record.formats : Array.isArray(record.paperFormats) ? record.paperFormats : null;
  const rawHighlights = Array.isArray(record.highlights) ? record.highlights : null;
  const rawDefaultFormat = record.defaultFormat ?? record.default_format;
  if (!rawFormats && !rawHighlights && rawDefaultFormat == null) {
    const inferredFormats = extractFormatsFromContent(post.content ?? "");
    if (!inferredFormats.length) return post;
    return { ...post, formats: inferredFormats };
  }
  const formatsFromPayload = (rawFormats ?? []).map((it) => normalizePaperFormat(it)).filter((it): it is PaperFormat => !!it);
  const inferredFormats = formatsFromPayload.length ? [] : extractFormatsFromContent(post.content ?? "");
  const formats = formatsFromPayload.length ? formatsFromPayload : inferredFormats;
  const highlights = (rawHighlights ?? []).map((it, idx) => normalizePaperHighlight(it, idx)).filter((it): it is PaperHighlight => !!it);
  const defaultFormat = normalizePaperFormatType(rawDefaultFormat) ?? null;
  return {
    ...post,
    formats,
    highlights,
    defaultFormat
  };
}

export async function apiLogin(req: LoginReq): Promise<string> {
  const data = await httpJson<AuthResp>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(req) });
  return data.accessToken;
}

export async function apiLogout(accessToken: string, signal?: AbortSignal): Promise<void> {
  await httpJson<Record<string, never>>("/api/v1/auth/logout", { method: "POST", accessToken, body: JSON.stringify({}), signal });
}

export async function apiRequestRegisterEmailCode(email: string): Promise<{ expiresAt?: string; debugCode?: string; status?: string }> {
  return httpJson<{ expiresAt?: string; debugCode?: string; status?: string }>("/api/v1/auth/register/email-code/request", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function apiRegister(req: { email: string; password: string; displayName: string; code: string }): Promise<{ userId: string; email: string; displayName: string }> {
  return httpJson<{ userId: string; email: string; displayName: string }>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(req) });
}

export async function apiRequestPasswordReset(email: string): Promise<{ expiresAt?: string; debugCode?: string }> {
  return httpJson<{ expiresAt?: string; debugCode?: string }>("/api/v1/auth/password/request", { method: "POST", body: JSON.stringify({ email }) });
}

export async function apiConfirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  await httpJson<Record<string, never>>("/api/v1/auth/password/confirm", { method: "POST", body: JSON.stringify({ email, code, newPassword }) });
}

export async function apiGetMyProfile(accessToken: string, signal?: AbortSignal): Promise<UserProfile> {
  return httpJson<UserProfile>("/api/v1/users/me", { method: "GET", accessToken, signal });
}

export async function apiUpdateMyProfile(
  accessToken: string,
  patch: { displayName: string; avatarUrl?: string | null; bio?: string | null }
): Promise<UserProfile> {
  return httpJson<UserProfile>("/api/v1/users/me", { method: "PATCH", accessToken, body: JSON.stringify(patch) });
}

export async function apiUploadMyAvatar(accessToken: string, file: File): Promise<UserProfile> {
  const form = new FormData();
  form.set("file", file);
  return httpJson<UserProfile>("/api/v1/users/me/avatar", { method: "POST", accessToken, body: form });
}

export async function apiListPosts(pageNumber: number, pageSize: number, signal?: AbortSignal): Promise<Paged<Post>> {
  const data = await httpJson<Paged<Post>>(`/api/v1/posts?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET", signal });
  return {
    ...data,
    items: data.items.map((it) => normalizePostPaperProtocol(it))
  };
}

export async function apiGetPost(postId: string, accessToken?: string, signal?: AbortSignal): Promise<Post> {
  const post = await httpJson<Post>(`/api/v1/posts/${encodeURIComponent(postId)}`, { method: "GET", accessToken, signal });
  return normalizePostPaperProtocol(post);
}

export async function apiFavoritePost(accessToken: string, postId: string): Promise<void> {
  await httpJson<Record<string, never>>(`/api/v1/posts/${encodeURIComponent(postId)}/favorite`, { method: "POST", accessToken, body: JSON.stringify({}) });
}

export async function apiUnfavoritePost(accessToken: string, postId: string): Promise<void> {
  await httpJson<Record<string, never>>(`/api/v1/posts/${encodeURIComponent(postId)}/favorite`, { method: "DELETE", accessToken });
}

export async function apiListFavorites(pageNumber: number, pageSize: number, accessToken: string, signal?: AbortSignal): Promise<Paged<Post>> {
  return httpJson<Paged<Post>>(`/api/v1/favorites?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET", accessToken, signal });
}

export async function apiListFootprints(pageNumber: number, pageSize: number, accessToken: string, signal?: AbortSignal): Promise<Paged<Post>> {
  return httpJson<Paged<Post>>(`/api/v1/footprints?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET", accessToken, signal });
}

export async function apiListComments(postId: string, pageNumber: number, pageSize: number, signal?: AbortSignal): Promise<Paged<Comment>> {
  return httpJson<Paged<Comment>>(
    `/api/v1/comments?postId=${encodeURIComponent(postId)}&page[number]=${pageNumber}&page[size]=${pageSize}`,
    { method: "GET", signal }
  );
}

export async function apiCreateComment(accessToken: string, postId: string, content: string): Promise<Comment> {
  return httpJson<Comment>("/api/v1/comments", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ postId, content })
  });
}

export async function apiAdminListComments(
  accessToken: string,
  status: string,
  pageNumber: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<Paged<Comment>> {
  return httpJson<Paged<Comment>>(
    `/api/v1/admin/comments?status=${encodeURIComponent(status)}&page[number]=${pageNumber}&page[size]=${pageSize}`,
    { method: "GET", accessToken, signal }
  );
}

export async function apiAdminUpdateCommentStatus(accessToken: string, commentId: string, status: "APPROVED" | "REJECTED"): Promise<Comment> {
  return httpJson<Comment>(`/api/v1/admin/comments/${encodeURIComponent(commentId)}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ status })
  });
}

export async function apiAdminUpdatePostCommentModeration(
  accessToken: string,
  postId: string,
  commentModerationEnabled: boolean
): Promise<{ postId: string; commentModerationEnabled: boolean }> {
  return httpJson<{ postId: string; commentModerationEnabled: boolean }>(`/api/v1/admin/posts/${encodeURIComponent(postId)}/comment-moderation`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ commentModerationEnabled })
  });
}

export async function apiAdminListUsers(
  accessToken: string,
  params: { q?: string; status?: string; role?: string; pageNumber: number; pageSize: number },
  signal?: AbortSignal
): Promise<Paged<AdminUser>> {
  const qp = new URLSearchParams();
  if (params.q) qp.set("q", params.q);
  if (params.status) qp.set("status", params.status);
  if (params.role) qp.set("role", params.role);
  qp.set("page[number]", String(params.pageNumber));
  qp.set("page[size]", String(params.pageSize));
  return httpJson<Paged<AdminUser>>(`/api/v1/admin/users?${qp.toString()}`, { method: "GET", accessToken, signal });
}

export async function apiAdminUpdateUser(
  accessToken: string,
  userId: string,
  patch: { displayName?: string; roles?: string[]; status?: string }
): Promise<AdminUser> {
  return httpJson<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", accessToken, body: JSON.stringify(patch) });
}

export async function apiAdminRevokeUserTokens(accessToken: string, userId: string): Promise<void> {
  await httpJson<Record<string, never>>(`/api/v1/admin/users/${encodeURIComponent(userId)}/revoke-tokens`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({})
  });
}

export async function apiAdminListMailTemplateTypes(accessToken: string, signal?: AbortSignal): Promise<Record<string, string>> {
  const data = await httpJson<{ items: Record<string, string> }>("/api/v1/admin/settings/mail-templates/types", {
    method: "GET",
    accessToken,
    signal
  });
  return data.items ?? {};
}

export async function apiAdminGetMailTemplate(accessToken: string, templateType: string, signal?: AbortSignal): Promise<MailTemplateSettings> {
  return httpJson<MailTemplateSettings>(`/api/v1/admin/settings/mail-templates/${encodeURIComponent(templateType)}`, {
    method: "GET",
    accessToken,
    signal
  });
}

export async function apiAdminUpdateMailTemplate(
  accessToken: string,
  templateType: string,
  patch: { subjectTemplate: string; bodyTemplate: string }
): Promise<MailTemplateSettings> {
  return httpJson<MailTemplateSettings>(`/api/v1/admin/settings/mail-templates/${encodeURIComponent(templateType)}`, {
    method: "PUT",
    accessToken,
    body: JSON.stringify(patch)
  });
}

type PathfinderSessionPayload = {
  goal: string;
  model: PathfinderModel;
  focus: string[];
  stages: PathfinderStage[];
  messages: Array<{ id: string; role: "assistant" | "user"; content: string }>;
  activeStageId?: string | null;
};

type PathfinderGeneratePayload = {
  goal: string;
  model: PathfinderModel;
};

type PathfinderGenerateResponse = {
  goal: string;
  model: PathfinderModel;
  focus: string[];
  stages: PathfinderStage[];
  assistantMessage: string;
};

type AiChatPayload = {
  model: PathfinderModel;
  systemPrompt: string;
  userPrompt: string;
};

type AiChatResponse = {
  model: PathfinderModel;
  assistantMessage: string;
};

export async function apiListPathfinderSessions(
  accessToken: string,
  pageNumber: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<Paged<PathfinderSession>> {
  return httpJson<Paged<PathfinderSession>>(`/api/v1/pathfinder/sessions?page[number]=${pageNumber}&page[size]=${pageSize}`, {
    method: "GET",
    accessToken,
    signal
  });
}

export async function apiUpsertPathfinderSession(
  accessToken: string,
  sessionId: string,
  payload: PathfinderSessionPayload
): Promise<PathfinderSession> {
  return httpJson<PathfinderSession>(`/api/v1/pathfinder/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    accessToken,
    body: JSON.stringify(payload)
  });
}

export async function apiGeneratePathfinderPlan(
  accessToken: string,
  payload: PathfinderGeneratePayload
): Promise<PathfinderGenerateResponse> {
  return httpJson<PathfinderGenerateResponse>("/api/v1/pathfinder/sessions/plan", {
    method: "POST",
    accessToken,
    timeoutMs: 90000,
    body: JSON.stringify(payload)
  });
}

export async function apiAiChat(
  accessToken: string,
  payload: AiChatPayload
): Promise<AiChatResponse> {
  return httpJson<AiChatResponse>("/api/v1/ai/chat", {
    method: "POST",
    accessToken,
    timeoutMs: 90000,
    body: JSON.stringify(payload)
  });
}

export async function apiFavoritePathfinderSession(accessToken: string, sessionId: string): Promise<PathfinderSession> {
  return httpJson<PathfinderSession>(`/api/v1/pathfinder/sessions/${encodeURIComponent(sessionId)}/favorite`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({})
  });
}

export async function apiUnfavoritePathfinderSession(accessToken: string, sessionId: string): Promise<PathfinderSession> {
  return httpJson<PathfinderSession>(`/api/v1/pathfinder/sessions/${encodeURIComponent(sessionId)}/favorite`, {
    method: "DELETE",
    accessToken
  });
}
