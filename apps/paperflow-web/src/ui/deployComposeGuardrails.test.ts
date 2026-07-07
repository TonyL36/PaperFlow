import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deploy-ecs-no-build compose guardrails", () => {
  it("validates production compose dockerfile mappings before packaging and upload", () => {
    const source = readFileSync(resolve(__dirname, "../../../../scripts/deploy-ecs-no-build.ps1"), "utf8");

    expect(source).toContain("function Test-ComposeProdDockerfileMap");
    expect(source).toContain("user-service");
    expect(source).toContain("docker/Dockerfile.user-service");
    expect(source).toContain("content-service");
    expect(source).toContain("docker/Dockerfile.content-service");
    expect(source).toContain("api-gateway");
    expect(source).toContain("docker/Dockerfile.api-gateway");
    expect(source).toContain("frontend");
    expect(source).toContain("docker/Dockerfile.frontend");
    expect(source).toContain("if (-not (Test-ComposeProdDockerfileMap $repoRoot)) { throw \"compose.prod.yml dockerfile mapping check failed\" }");
  });
});
