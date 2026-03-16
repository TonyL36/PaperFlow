import { httpJson } from "./http";
import type { Comment, Paged, Post } from "./types";

type LoginReq = { email: string; password: string };
type AuthResp = { accessToken: string };

export async function apiLogin(req: LoginReq): Promise<string> {
  const data = await httpJson<AuthResp>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(req) });
  return data.accessToken;
}

export async function apiLogout(accessToken: string, signal?: AbortSignal): Promise<void> {
  await httpJson<Record<string, never>>("/api/v1/auth/logout", { method: "POST", accessToken, body: JSON.stringify({}), signal });
}

export async function apiListPosts(pageNumber: number, pageSize: number, signal?: AbortSignal): Promise<Paged<Post>> {
  return httpJson<Paged<Post>>(`/api/v1/posts?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET", signal });
}

export async function apiGetPost(postId: string, signal?: AbortSignal): Promise<Post> {
  return httpJson<Post>(`/api/v1/posts/${encodeURIComponent(postId)}`, { method: "GET", signal });
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
