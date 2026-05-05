import { cpSync, mkdtempSync, readdirSync, statSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function touchJsonlFiles(root: string, when: Date) {
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      touchJsonlFiles(fullPath, when);
      continue;
    }
    if (entry.endsWith('.jsonl')) {
      utimesSync(fullPath, when, when);
    }
  }
}

export function prepareSmokeFixtureWorkspace(sourceFixturePath: string): string {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-smoke-fixtures-'));
  cpSync(sourceFixturePath, fixtureRoot, { recursive: true });
  touchJsonlFiles(fixtureRoot, new Date());
  return fixtureRoot;
}
