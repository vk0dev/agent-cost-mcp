import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const docsReadme = readFileSync(path.join(root, "docs", "README.md"), "utf8");

const shippedDemoTrios = [
  {
    name: "tool analytics",
    cast: "docs/demo-tool-analytics.cast",
    gif: "docs/demo-tool-analytics.gif",
    script: "scripts/demo-tool-analytics.mjs",
    anchors: [
      "get_tool_usage",
      "getToolUsage",
      "get_cost_trend",
      "getCostTrend",
      "get_tool_roi",
      "getToolRoi",
      "detect_cost_anomalies",
      "detectCostAnomalies",
      "estimate_run_cost",
      "estimateRunCost",
    ],
  },
  {
    name: "forecast",
    cast: "docs/demo-forecast.cast",
    gif: "docs/demo-forecast.gif",
    script: "scripts/demo-forecast.mjs",
    anchors: ["get_cost_forecast", "getCostForecast"],
  },
  {
    name: "subagent tree",
    cast: "docs/demo-subagent-tree.cast",
    gif: "docs/demo-subagent-tree.gif",
    script: "scripts/demo-subagent-tree.mjs",
    anchors: ["get_subagent_tree", "getSubagentTree"],
  },
  {
    name: "budget cap",
    cast: "docs/demo-budget-cap.cast",
    gif: "docs/demo-budget-cap.gif",
    script: "scripts/demo-budget-cap.mjs",
    anchors: ["writeBudgetState", "evaluateBudgetStatus"],
  },
  {
    name: "get session cost",
    cast: "docs/demo-get-session-cost.cast",
    gif: "docs/demo-get-session-cost.gif",
    script: "scripts/demo-get-session-cost.mjs",
    anchors: ["get_session_cost", "getSessionCost"],
  },
];

describe("shipped demo asset coverage", () => {
  it("keeps each shipped demo trio present and non-empty", () => {
    for (const demo of shippedDemoTrios) {
      for (const relativePath of [demo.cast, demo.gif, demo.script]) {
        const assetPath = path.join(root, relativePath);
        expect(existsSync(assetPath), `${demo.name}: ${relativePath}`).toBe(true);
        expect(statSync(assetPath).size, `${demo.name}: ${relativePath}`).toBeGreaterThan(0);
      }
    }
  });

  it("indexes the new aggregate tool analytics demo in root and docs readmes", () => {
    for (const document of [readme, docsReadme]) {
      expect(document).toContain("demo-tool-analytics.gif");
      expect(document).toContain("demo-tool-analytics.cast");
      expect(document).toContain("demo-tool-analytics.mjs");
    }
  });

  it("keeps demo scripts anchored to the real exported tool functions they exercise", () => {
    for (const demo of shippedDemoTrios) {
      const script = readFileSync(path.join(root, demo.script), "utf8");
      for (const anchor of demo.anchors) {
        expect(script, `${demo.name}: ${anchor}`).toContain(anchor);
      }
    }
  });
});
