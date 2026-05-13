import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const docsReadme = readFileSync(path.join(root, "docs", "README.md"), "utf8");

const assetPaths = {
  cast: path.join(root, "docs", "demo-get-session-cost.cast"),
  gif: path.join(root, "docs", "demo-get-session-cost.gif"),
  script: path.join(root, "scripts", "demo-get-session-cost.mjs"),
};

describe("get_session_cost demo asset surface", () => {
  it("indexes the shipped demo in root and docs readmes", () => {
    expect(readme).toContain("get_session_cost");
    expect(readme).toContain("demo-get-session-cost.gif");
    expect(readme).toContain("scripts/demo-get-session-cost.mjs");

    expect(docsReadme).toContain("get_session_cost");
    expect(docsReadme).toContain("demo-get-session-cost.cast");
    expect(docsReadme).toContain("demo-get-session-cost.gif");
    expect(docsReadme).toContain("demo-get-session-cost.mjs");
  });

  it("keeps the shipped demo trio present and non-empty", () => {
    for (const assetPath of Object.values(assetPaths)) {
      expect(existsSync(assetPath)).toBe(true);
      expect(statSync(assetPath).size).toBeGreaterThan(0);
    }
  });

  it("keeps the demo script anchored to get_session_cost output", () => {
    const script = readFileSync(assetPaths.script, "utf8");
    expect(script).toContain("get_session_cost");
    expect(script).toContain("getSessionCost");
    expect(script).toContain("session-main");
  });
});
