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

const DEFAULT_TIMEOUT_MS = 8000;

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

  const timeout = resolveTimeoutMs(input, init.method);
  const timeoutController = new AbortController();
  const signals = [timeoutController.signal];
  if (init.signal) {
    signals.push(init.signal);
  }
  const signal = mergeAbortSignals(signals);
  const timer = setTimeout(() => timeoutController.abort(), timeout);
  let resp: Response;
  try {
    resp = await fetch(input, { ...init, headers, signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError(`请求超时（>${timeout}ms）`, "SYS_TIMEOUT", "");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

function resolveTimeoutMs(input: string, method?: string) {
  const m = (method || "GET").toUpperCase();
  if (input.includes("/api/v1/pathfinder/sessions/plan")) {
    return 12000;
  }
  if (m === "GET") {
    return DEFAULT_TIMEOUT_MS;
  }
  return 10000;
}

function mergeAbortSignals(signals: AbortSignal[]) {
  if (signals.length === 1) {
    return signals[0];
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
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
