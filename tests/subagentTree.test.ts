import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSubagentTree } from '../src/tools/index.js';

function makeFixtureWorkspace() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-subagent-'));
  cpSync(path.join(process.cwd(), 'fixtures', 'session-main.jsonl'), path.join(dir, 'session-main.jsonl'));
  cpSync(path.join(process.cwd(), 'fixtures', 'session-subagent.jsonl'), path.join(dir, 'session-subagent.jsonl'));
  return dir;
}

function addRootToChildLink(projectPath: string) {
  writeFileSync(
    path.join(projectPath, 'session-subagent.jsonl'),
    [
      JSON.stringify({
        type: 'user',
        sourceToolAssistantUUID: 'asst-1',
        message: { content: [{ type: 'text', text: 'spawned from root session' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'sub-1',
        model: 'claude-opus-4',
        usage: {
          input_tokens: 400,
          output_tokens: 100,
          cache_read_input_tokens: 25,
          cache_creation_input_tokens: 10,
        },
        message: { content: [{ type: 'tool_use', id: 'toolu_sub_1', name: 'Grep' }, { type: 'tool_use', id: 'toolu_sub_2', name: 'Read' }] },
      }),
      JSON.stringify({
        type: 'user',
        sourceToolAssistantUUID: 'sub-1',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_sub_1', content: 'match' }] },
      }),
    ].join('\n') + '\n',
  );
}

function addGrandchildFixture(projectPath: string) {
  writeFileSync(
    path.join(projectPath, 'session-grandchild.jsonl'),
    [
      JSON.stringify({
        type: 'assistant',
        uuid: 'grand-1',
        model: 'claude-haiku-4',
        usage: {
          input_tokens: 200,
          output_tokens: 100,
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
}

describe('subagent tree focused behavior', () => {
  it('keeps the root out of its own children and avoids recursive cycle expansion', () => {
    const projectPath = makeFixtureWorkspace();
    addRootToChildLink(projectPath);

    const result = getSubagentTree({ sessionId: 'session-main', projectPath });

    expect(result.tree.sessionId).toBe('session-main');
    expect(result.tree.children.some((child) => child.sessionId === 'session-main')).toBe(false);
    expect(result.tree.children).toHaveLength(1);
    expect(result.tree.children[0]?.children).toEqual([]);
    expect(result.tree.subtreeCost).toBeGreaterThanOrEqual(result.tree.estimatedCostUsd);
    expect(result.totalSessions).toBe(2);
  });

  it('does not attach unrelated session logs as synthetic root children', () => {
    const projectPath = makeFixtureWorkspace();
    addRootToChildLink(projectPath);
    writeFileSync(
      path.join(projectPath, 'session-unrelated.jsonl'),
      [
        JSON.stringify({
          type: 'assistant',
          uuid: 'orphan-1',
          model: 'claude-sonnet-4',
          usage: {
            input_tokens: 300,
            output_tokens: 120,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          message: { content: [{ type: 'text', text: 'standalone session' }] },
        }),
      ].join('\n') + '\n',
    );

    const result = getSubagentTree({ sessionId: 'session-main', projectPath });

    expect(result.tree.children.map((child) => child.sessionId)).toEqual(['session-subagent']);
    expect(result.totalSessions).toBe(2);
  });

  it('adds subtreeCost rollups across parent child grandchild trees', () => {
    const projectPath = makeFixtureWorkspace();
    addRootToChildLink(projectPath);
    addGrandchildFixture(projectPath);

    const result = getSubagentTree({ sessionId: 'session-main', projectPath });
    const child = result.tree.children[0]!;
    const grandchild = child.children[0]!;

    expect(result.totalSessions).toBe(3);
    expect(child.sessionId).toBe('session-subagent');
    expect(grandchild.sessionId).toBe('session-grandchild');
    expect(grandchild.children).toEqual([]);
    expect(grandchild.subtreeCost).toBe(grandchild.estimatedCostUsd);
    expect(child.subtreeCost).toBeCloseTo(child.estimatedCostUsd + grandchild.subtreeCost, 6);
    expect(result.tree.subtreeCost).toBeCloseTo(result.tree.estimatedCostUsd + child.subtreeCost, 6);
    expect(result.totalCostUsd).toBe(result.tree.subtreeCost);
  });
});
