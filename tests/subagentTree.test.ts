import { cpSync, mkdtempSync } from 'node:fs';
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

describe('subagent tree focused behavior', () => {
  it('keeps the root out of its own children and avoids recursive cycle expansion', () => {
    const projectPath = makeFixtureWorkspace();

    const result = getSubagentTree({ sessionId: 'session-main', projectPath });

    expect(result.tree.sessionId).toBe('session-main');
    expect(result.tree.children.some((child) => child.sessionId === 'session-main')).toBe(false);
    expect(result.tree.children).toHaveLength(1);
    expect(result.tree.children[0]?.children).toEqual([]);
    expect(result.totalSessions).toBe(2);
  });
});
