import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dev server config integration", () => {
  it("提供稳定的 127.0.0.1 本地开发配置和云端联调脚本", () => {
    const packageJsonPath = resolve(__dirname, "..", "..", "package.json");
    const viteConfigPath = resolve(__dirname, "..", "..", "vite.config.ts");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
    const viteConfigSource = readFileSync(viteConfigPath, "utf8");

    expect(packageJson.scripts?.["dev:cloud"]).toContain("VITE_API_BASE=http://47.109.193.180:9628");
    expect(packageJson.scripts?.["dev:cloud"]).toContain("--host 127.0.0.1");
    expect(packageJson.scripts?.["dev:cloud"]).toContain("--port 9630");
    expect(viteConfigSource).toMatch(/host:\s*"127\.0\.0\.1"/);
  });
});
