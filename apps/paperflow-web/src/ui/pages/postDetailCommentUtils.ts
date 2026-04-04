import type { Comment } from "../data/types";

export type CommentSortMode = "latest" | "hot";

export function likeCountOf(comment: Comment): number {
  const count = comment.likeCount ?? 0;
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function repliesOf(comment: Comment): Comment[] {
  return Array.isArray(comment.replies) ? comment.replies : [];
}

export function buildReplyDraft(userId: string): string {
  return `@${userId} `;
}

export function totalVisibleCommentCount(comments: Comment[]): number {
  return comments.reduce((sum, comment) => sum + 1 + repliesOf(comment).length, 0);
}

export function commentDisplayNameOf(userId: string): string {
  const raw = (userId ?? "").trim();
  if (!raw) return "用户";
  return raw.startsWith("u_") ? raw.slice(2) : raw;
}

export function commentAvatarTextOf(userId: string): string {
  const name = commentDisplayNameOf(userId);
  return (name[0] ?? "U").toUpperCase();
}

export function commentAvatarHueOf(userId: string): number {
  const seed = (userId ?? "").trim();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return Number.isFinite(hue) ? hue : 210;
}

export function sortedRootComments(comments: Comment[], mode: CommentSortMode): Comment[] {
  const rows = [...comments];
  rows.sort((a, b) => {
    if (mode === "hot") {
      const diff = likeCountOf(b) - likeCountOf(a);
      if (diff !== 0) return diff;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  return rows;
}

export function visibleReplies(comment: Comment, expanded: boolean, limit = 3): Comment[] {
  const replies = repliesOf(comment);
  if (expanded || replies.length <= limit) return replies;
  return replies.slice(0, limit);
}

export function hasHiddenReplies(comment: Comment, limit = 3): boolean {
  return repliesOf(comment).length > limit;
}
