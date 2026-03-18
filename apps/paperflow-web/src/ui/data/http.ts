import type { Envelope, EnvelopeErr, EnvelopeOk } from "./types";

export class ApiError extends Error {
  code: string;
  requestId: string;

  constructor(message: string, code: string, requestId: string) {
    super(message);
    this.code = code;
    this.requestId = requestId;
  }
}

export async function httpJson<T>(
  input: string,
  init: RequestInit & { accessToken?: string; requestId?: string } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }
  if (init.requestId) {
    headers.set("X-Request-Id", init.requestId);
  }

  const resp = await fetch(input, { ...init, headers });
  const text = await resp.text();
  let body: Envelope<T> | null = null;
  try {
    body = text ? (JSON.parse(text) as Envelope<T>) : null;
  } catch {
    body = null;
  }

  if (!resp.ok) {
    if (body && isErr(body)) {
      throw new ApiError(body.error.message || `HTTP ${resp.status}`, body.error.code || "SYS_HTTP_ERROR", body.requestId || resp.headers.get("X-Request-Id") || "");
    }
    throw new ApiError(`HTTP ${resp.status}`, "SYS_HTTP_ERROR", resp.headers.get("X-Request-Id") || "");
  }

  if (!body) {
    throw new ApiError("Empty response body", "SYS_EMPTY_BODY", resp.headers.get("X-Request-Id") || "");
  }
  if (isErr(body)) {
    throw new ApiError(body.error.message || "请求失败", body.error.code || "SYS_HTTP_ERROR", body.requestId || resp.headers.get("X-Request-Id") || "");
  }
  if (isOk(body)) {
    return body.data;
  }
  throw new ApiError("Invalid response envelope", "SYS_INVALID_ENVELOPE", resp.headers.get("X-Request-Id") || "");
}

function isErr<T>(e: Envelope<T>): e is EnvelopeErr {
  const err = (e as EnvelopeErr).error as unknown;
  if (!err || typeof err !== "object") {
    return false;
  }
  const maybe = err as { code?: unknown; message?: unknown };
  return typeof maybe.code === "string" || typeof maybe.message === "string";
}

function isOk<T>(e: Envelope<T>): e is EnvelopeOk<T> {
  return (e as EnvelopeOk<T>).data !== undefined;
}
