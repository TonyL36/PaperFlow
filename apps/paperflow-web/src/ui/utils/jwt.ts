export type JwtPayload = { sub?: string; roles?: string[]; exp?: number };

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const b64 = normalized + pad;
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = (token ?? "").split(".");
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1] ?? "");
    const obj = JSON.parse(json) as any;
    const roles = Array.isArray(obj?.roles) ? obj.roles.map(String) : undefined;
    return {
      sub: typeof obj?.sub === "string" ? obj.sub : undefined,
      roles,
      exp: typeof obj?.exp === "number" ? obj.exp : undefined
    };
  } catch {
    return null;
  }
}
