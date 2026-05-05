#!/usr/bin/env node
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { getSubagentTree } from '../dist/tools/index.js';

const REPO_ROOT = process.cwd();
const FIXTURES = path.join(REPO_ROOT, 'fixtures');
const TYPE_DELAY_MS = 10;
const LINE_DELAY_MS = 90;

function createDemoProject() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-subagent-demo-'));
  const mainPath = path.join(tempDir, 'session-main.jsonl');
  const subagentPath = path.join(tempDir, 'session-subagent.jsonl');
  const grandchildPath = path.join(tempDir, 'session-grandchild.jsonl');

  cpSync(path.join(FIXTURES, 'session-main.jsonl'), mainPath);

  writeFileSync(
    subagentPath,
    [
      JSON.stringify({
        type: 'assistant',
        uuid: 'sub-1',
        model: 'claude-opus-4',
        usage: {
          input_tokens: 420,
          output_tokens: 160,
          cache_read_input_tokens: 25,
          cache_creation_input_tokens: 10,
        },
        message: {
          content: [
            { type: 'tool_use', id: 'toolu_sub_1', name: 'Read' },
            { type: 'tool_use', id: 'toolu_sub_2', name: 'Grep' },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        sourceToolAssistantUUID: 'asst-1',
        message: { content: [{ type: 'text', text: 'spawned from root session' }] },
      }),
      JSON.stringify({
        type: 'user',
        sourceToolAssistantUUID: 'sub-1',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'toolu_sub_1', content: 'match' }],
        },
      }),
    ].join('\n') + '\n',
  );

  writeFileSync(
    grandchildPath,
    [
      JSON.stringify({
        type: 'assistant',
        uuid: 'grand-1',
        model: 'claude-haiku-4',
        usage: {
          input_tokens: 160,
          output_tokens: 80,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        message: { content: [{ type: 'text', text: 'grandchild done' }] },
      }),
      JSON.stringify({
        type: 'user',
        sourceToolAssistantUUID: 'sub-1',
        message: { content: [{ type: 'text', text: 'spawned from subagent' }] },
      }),
    ].join('\n') + '\n',
  );

  return { tempDir, mainPath };
}

function compactTree(tree) {
  return {
    sessionId: tree.sessionId,
    estimatedCostUsd: tree.estimatedCostUsd,
    subtreeCost: tree.subtreeCost,
    turnCount: tree.turnCount,
    children: tree.children.map(compactTree),
  };
}

async function typeLine(text) {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(TYPE_DELAY_MS);
  }
  process.stdout.write('\n');
}

async function printBlock(lines) {
  for (const line of lines) {
    console.log(line);
    await sleep(LINE_DELAY_MS);
  }
}

async function main() {
  const { tempDir, mainPath } = createDemoProject();
  try {
    const result = getSubagentTree({ projectPath: tempDir, sessionPath: mainPath });
    const view = {
      sessionCount: result.sessionCount,
      totalCostUsd: result.totalCostUsd,
      tree: compactTree(result.tree),
    };

    await printBlock([
      '\u001b[2m# A delegated run finished overnight. Which branch burned the budget?\u001b[0m',
      '',
    ]);
    await typeLine('$ npx -y @vk0/agent-cost-mcp get_subagent_tree --session session-main.jsonl');
    await sleep(250);
    await printBlock(JSON.stringify(view, null, 2).split('\n'));
    await printBlock([
      '',
      '\u001b[32m# subtreeCost makes the expensive branch obvious fast.\u001b[0m',
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
