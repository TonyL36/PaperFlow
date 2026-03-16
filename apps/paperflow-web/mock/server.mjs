import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const now = Date.now();
const posts = Array.from({ length: 15 }).map((_, i) => {
  const dt = new Date(now - i * 86400000);
  const id = `post_${String(i + 1).padStart(3, "0")}`;
  return {
    id,
    title: `Daily Update ${dt.toISOString().slice(0, 10)}`,
    content:
      `这是用于跑通前后端链路的 Mock 帖子内容（${id}）。\n\n` +
      `你可以在此基础上替换为 Curator/Editor 生成的每日精选摘要。\n` +
      `- 模拟数据源：mock/server.mjs\n` +
      `- 目标：先跑通业务层与可视化\n`,
    source: i % 3 === 0 ? "scheduler" : i % 3 === 1 ? "curator" : "editor",
    publishedAt: dt.toISOString()
  };
});

const users = {
  "alice@example.com": { userId: "u_alice", password: "password123", roles: ["USER"] },
  "admin@example.com": { userId: "u_admin", password: "admin12345", roles: ["USER", "ADMIN"] }
};

const comments = [];

function envRequestId(req) {
  const v = req.header("X-Request-Id");
  return v && String(v).trim() ? String(v) : crypto.randomUUID();
}

function ok(req, data) {
  return { requestId: envRequestId(req), data, links: [] };
}

function err(req, code, message, status) {
  return { status: status ?? 400, body: { requestId: envRequestId(req), error: { code, message } } };
}

function parseAuth(req) {
  const auth = req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const t = auth.slice("Bearer ".length).trim();
  try {
    const json = Buffer.from(t, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    const userId = String(payload?.sub ?? "");
    const roles = Array.isArray(payload?.roles) ? payload.roles.map((r) => String(r)) : [];
    if (!userId) return null;
    return { userId, roles };
  } catch {
    return null;
  }
}

app.post("/api/v1/auth/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const u = users[String(email ?? "").toLowerCase()];
  if (!u || u.password !== String(password ?? "")) {
    const e = err(req, "AUTH_INVALID_CREDENTIALS", "Invalid credentials", 401);
    return res.status(e.status).json(e.body);
  }
  const accessToken = Buffer.from(JSON.stringify({ sub: u.userId, roles: u.roles }), "utf8").toString("base64url");
  res.cookie("PF_REFRESH", crypto.randomBytes(16).toString("hex"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/v1/auth/refresh"
  });
  return res.json(ok(req, { accessToken }));
});

app.post("/api/v1/auth/logout", (req, res) => {
  res.cookie("PF_REFRESH", "", { httpOnly: true, sameSite: "lax", path: "/api/v1/auth/refresh", maxAge: 0 });
  return res.json(ok(req, {}));
});

app.get("/api/v1/posts", (req, res) => {
  const pn = Math.max(1, Number(req.query["page[number]"] ?? 1));
  const ps = Math.min(200, Math.max(1, Number(req.query["page[size]"] ?? 20)));
  const start = (pn - 1) * ps;
  const items = posts.slice(start, start + ps).map((p) => ({
    postId: p.id,
    title: p.title,
    content: p.content,
    source: p.source,
    publishedAt: p.publishedAt
  }));
  return res.json(ok(req, { items, page: { number: pn, size: ps, totalItems: posts.length } }));
});

app.get("/api/v1/posts/:postId", (req, res) => {
  const p = posts.find((x) => x.id === req.params.postId);
  if (!p) {
    const e = err(req, "RES_NOT_FOUND", "Post not found", 404);
    return res.status(e.status).json(e.body);
  }
  return res.json(
    ok(req, { postId: p.id, title: p.title, content: p.content, source: p.source, publishedAt: p.publishedAt })
  );
});

app.get("/api/v1/comments", (req, res) => {
  const postId = String(req.query.postId ?? "");
  const pn = Math.max(1, Number(req.query["page[number]"] ?? 1));
  const ps = Math.min(200, Math.max(1, Number(req.query["page[size]"] ?? 20)));
  if (!posts.some((p) => p.id === postId)) {
    const e = err(req, "RES_NOT_FOUND", "Post not found", 404);
    return res.status(e.status).json(e.body);
  }
  const items = comments
    .filter((c) => c.postId === postId && c.status === "APPROVED")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice((pn - 1) * ps, (pn - 1) * ps + ps);
  return res.json(ok(req, { items, page: { number: pn, size: ps } }));
});

app.post("/api/v1/comments", (req, res) => {
  const auth = parseAuth(req);
  if (!auth) {
    const e = err(req, "AUTH_MISSING_TOKEN", "Missing user identity", 401);
    return res.status(e.status).json(e.body);
  }
  const { postId, content } = req.body ?? {};
  if (!posts.some((p) => p.id === String(postId ?? ""))) {
    const e = err(req, "RES_NOT_FOUND", "Post not found", 404);
    return res.status(e.status).json(e.body);
  }
  const c = {
    commentId: `c_${crypto.randomUUID().replaceAll("-", "")}`,
    postId: String(postId),
    userId: auth.userId,
    content: String(content ?? ""),
    status: "PENDING",
    createdAt: new Date().toISOString()
  };
  comments.push(c);
  return res.status(201).json(ok(req, c));
});

app.get("/api/v1/admin/comments", (req, res) => {
  const auth = parseAuth(req);
  if (!auth || !auth.roles.includes("ADMIN")) {
    const e = err(req, "AUTH_FORBIDDEN", "Admin required", 403);
    return res.status(e.status).json(e.body);
  }
  const status = String(req.query.status ?? "PENDING");
  const pn = Math.max(1, Number(req.query["page[number]"] ?? 1));
  const ps = Math.min(200, Math.max(1, Number(req.query["page[size]"] ?? 20)));
  const items = comments
    .filter((c) => c.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice((pn - 1) * ps, (pn - 1) * ps + ps);
  return res.json(ok(req, { items, page: { number: pn, size: ps } }));
});

app.patch("/api/v1/admin/comments/:commentId", (req, res) => {
  const auth = parseAuth(req);
  if (!auth || !auth.roles.includes("ADMIN")) {
    const e = err(req, "AUTH_FORBIDDEN", "Admin required", 403);
    return res.status(e.status).json(e.body);
  }
  const c = comments.find((x) => x.commentId === req.params.commentId);
  if (!c) {
    const e = err(req, "RES_NOT_FOUND", "Comment not found", 404);
    return res.status(e.status).json(e.body);
  }
  const status = String(req.body?.status ?? "");
  if (status !== "APPROVED" && status !== "REJECTED") {
    const e = err(req, "REQ_VALIDATION_FAILED", "Validation failed", 400);
    return res.status(e.status).json(e.body);
  }
  c.status = status;
  return res.json(ok(req, c));
});

const port = Number(process.env.PORT ?? 3151);
app.listen(port, () => {
  process.stdout.write(`mock api listening on http://localhost:${port}\n`);
});
