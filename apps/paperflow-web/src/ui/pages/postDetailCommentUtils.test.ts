import { describe, expect, it } from "vitest";
import type { Comment } from "../data/types";
import { buildReplyDraft, commentAvatarHueOf, commentAvatarTextOf, commentDisplayNameOf, hasHiddenReplies, likeCountOf, repliesOf, sortedRootComments, totalVisibleCommentCount, visibleReplies } from "./postDetailCommentUtils";

const makeComment = (patch: Partial<Comment>): Comment => ({
  commentId: "c1",
  postId: "p1",
  userId: "u1",
  content: "content",
  status: "APPROVED",
  createdAt: "2026-01-01T00:00:00Z",
  ...patch
});

describe("postDetailCommentUtils", () => {
  it("计算点赞数时处理空值与非法值", () => {
    expect(likeCountOf(makeComment({ likeCount: 3 }))).toBe(3);
    expect(likeCountOf(makeComment({ likeCount: null }))).toBe(0);
    expect(likeCountOf(makeComment({ likeCount: -1 }))).toBe(0);
  });

  it("提取子评论列表并计算可见评论总数", () => {
    const rootA = makeComment({
      commentId: "c_root_a",
      replies: [makeComment({ commentId: "c_reply_a1", parentCommentId: "c_root_a" })]
    });
    const rootB = makeComment({ commentId: "c_root_b" });
    expect(repliesOf(rootA)).toHaveLength(1);
    expect(repliesOf(rootB)).toHaveLength(0);
    expect(totalVisibleCommentCount([rootA, rootB])).toBe(3);
  });

  it("生成子评论回复草稿", () => {
    expect(buildReplyDraft("u_reply")).toBe("@u_reply ");
  });

  it("评论用户展示信息优先使用真实展示名", () => {
    expect(commentDisplayNameOf("u_task13_1", "张三")).toBe("张三");
    expect(commentDisplayNameOf("u_task13_1")).toBe("task13_1");
    expect(commentDisplayNameOf("")).toBe("用户");
    expect(commentAvatarTextOf("u_task13_1", "张三")).toBe("张");
    expect(commentAvatarTextOf("u_task13_1")).toBe("T");
    expect(commentAvatarHueOf("u_task13_1")).toBeGreaterThanOrEqual(0);
    expect(commentAvatarHueOf("u_task13_1")).toBeLessThan(360);
  });

  it("按热度与最新排序主评论", () => {
    const c1 = makeComment({ commentId: "c1", createdAt: "2026-01-01T00:00:00Z", likeCount: 1 });
    const c2 = makeComment({ commentId: "c2", createdAt: "2026-01-02T00:00:00Z", likeCount: 5 });
    const c3 = makeComment({ commentId: "c3", createdAt: "2026-01-03T00:00:00Z", likeCount: 2 });
    expect(sortedRootComments([c1, c2, c3], "latest").map((it) => it.commentId)).toEqual(["c3", "c2", "c1"]);
    expect(sortedRootComments([c1, c2, c3], "hot").map((it) => it.commentId)).toEqual(["c2", "c3", "c1"]);
  });

  it("子评论折叠默认展示3条，可展开", () => {
    const root = makeComment({
      commentId: "c_root",
      replies: [
        makeComment({ commentId: "r1", parentCommentId: "c_root" }),
        makeComment({ commentId: "r2", parentCommentId: "c_root" }),
        makeComment({ commentId: "r3", parentCommentId: "c_root" }),
        makeComment({ commentId: "r4", parentCommentId: "c_root" })
      ]
    });
    expect(hasHiddenReplies(root)).toBe(true);
    expect(visibleReplies(root, false)).toHaveLength(3);
    expect(visibleReplies(root, true)).toHaveLength(4);
  });
});
