/**
 * One-shot script: connects to the local MCP server via stdio, calls each of
 * the 4 tools with the bundled fixtures, and writes the full structuredContent
 * response to docs/examples/<tool>.json for use in README and landing page.
 *
 * Run after `npm run build`:
 *   node scripts/extract_examples.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const cwd = process.cwd();
const fixturePath = path.join(cwd, 'fixtures');
const outDir = path.join(cwd, 'docs', 'examples');
mkdirSync(outDir, { recursive: true });

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/server.js'],
  cwd,
  stderr: 'inherit',
});

const client = new Client({
  name: 'agent-cost-mcp-example-extractor',
  version: '1.0.0',
});

async function callAndSave(toolName, args, outFile) {
  const result = await client.callTool({ name: toolName, arguments: args });
  const payload = result?.structuredContent ?? {};
  const outPath = path.join(outDir, outFile);
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`wrote ${outPath}`);
}

async function run() {
  await client.connect(transport);

  await callAndSave(
    'get_session_cost',
    { sessionId: 'session-main', projectPath: fixturePath },
    'get_session_cost.json',
  );
  await callAndSave(
    'get_tool_usage',
    { projectPath: fixturePath, days: 7 },
    'get_tool_usage.json',
  );
  await callAndSave(
    'get_cost_trend',
    { projectPath: fixturePath, days: 7 },
    'get_cost_trend.json',
  );
  await callAndSave(
    'suggest_optimizations',
    { sessionId: 'session-main', projectPath: fixturePath },
    'suggest_optimizations.json',
  );

  await client.close();
}

run().catch(async (error) => {
  console.error('extract_examples failed:', error instanceof Error ? error.stack ?? error.message : String(error));
  try {
    await client.close();
  } catch {}
  process.exit(1);
});
