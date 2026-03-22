import { httpJson } from "./http";
import type { AdminUser, Comment, Paged, PathfinderModel, PathfinderSession, PathfinderStage, Post, UserProfile } from "./types";

type LoginReq = { email: string; password: string };
type AuthResp = { accessToken: string };

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

export async function apiListPosts(pageNumber: number, pageSize: number, signal?: AbortSignal): Promise<Paged<Post>> {
  return httpJson<Paged<Post>>(`/api/v1/posts?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET", signal });
}

export async function apiGetPost(postId: string, signal?: AbortSignal): Promise<Post> {
  return httpJson<Post>(`/api/v1/posts/${encodeURIComponent(postId)}`, { method: "GET", signal });
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
