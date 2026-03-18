import { ApiError } from "../data/http";

export type NormalizedError = {
  message: string;
  code?: string;
  requestId?: string;
};

export function normalizeError(e: unknown): NormalizedError {
  if (e instanceof ApiError) {
    return {
      message: e.message || "请求失败",
      code: e.code,
      requestId: e.requestId
    };
  }
  if (e instanceof Error) {
    return { message: e.message || "发生错误" };
  }
  if (typeof e === "string") {
    return { message: e };
  }
  return { message: "发生错误" };
}
