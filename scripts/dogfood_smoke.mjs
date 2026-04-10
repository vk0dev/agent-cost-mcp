import path from 'node:path';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const cwd = process.cwd();
const fixturePath = path.join(cwd, 'fixtures');

function summarizeToolResult(result) {
  const payload = result?.structuredContent ?? {};
  switch (true) {
    case Array.isArray(payload?.tools):
      return {
        toolCount: payload.tools.length,
        firstTool: payload.tools[0] ?? null,
      };
    case Array.isArray(payload?.daily):
      return {
        totalSessions: payload.totalSessions,
        totalCostUsd: payload.totalCostUsd,
        firstDay: payload.daily[0] ?? null,
      };
    case Array.isArray(payload?.suggestions):
      return {
        suggestionCount: payload.suggestions.length,
        firstSuggestion: payload.suggestions[0] ?? null,
      };
    default:
      return payload;
  }
}

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/server.js'],
  cwd,
  stderr: 'inherit',
});

const client = new Client({
  name: 'agent-cost-mcp-dogfood',
  version: '0.1.0',
});

async function run() {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();

  const outputs = {};
  outputs.get_session_cost = summarizeToolResult(
    await client.callTool({
      name: 'get_session_cost',
      arguments: { sessionId: 'session-main', projectPath: fixturePath },
    }),
  );
  outputs.get_tool_usage = summarizeToolResult(
    await client.callTool({
      name: 'get_tool_usage',
      arguments: { projectPath: fixturePath, days: 7 },
    }),
  );
  outputs.get_cost_trend = summarizeToolResult(
    await client.callTool({
      name: 'get_cost_trend',
      arguments: { projectPath: fixturePath, days: 7 },
    }),
  );
  outputs.suggest_optimizations = summarizeToolResult(
    await client.callTool({
      name: 'suggest_optimizations',
      arguments: { sessionId: 'session-main', projectPath: fixturePath },
    }),
  );

  console.log(JSON.stringify({ toolNames, outputs }, null, 2));

  await client.close();
}

run().catch(async (error) => {
  console.error('dogfood_smoke failed:', error instanceof Error ? error.stack ?? error.message : String(error));
  try {
    await client.close();
  } catch {}
  process.exit(1);
});
