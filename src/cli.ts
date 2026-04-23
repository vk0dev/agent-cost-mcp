#!/usr/bin/env node
import { existsSync, readFileSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { summarizeSessionLogs } from './parser.js';

export type CliOptions = {
  command: 'summary' | 'statusline';
  sessionPath?: string;
  subagentPaths: string[];
  help: boolean;
  watch: boolean;
  watchIntervalMs: number;
  format: 'zsh' | 'bash' | 'tmux';
};

export type WatchModeOptions = {
  sessionPath: string;
  subagentPaths: string[];
  watchIntervalMs: number;
  summarize?: typeof summarizeSessionLogs;
  print?: (text: string) => void;
  createWatcher?: (path: string, onChange: () => void) => { close(): void };
  waitForExit?: () => Promise<void>;
};

type BudgetState = {
  daily_usd?: number;
};

function printHelp(): void {
  console.log(`agent-cost-mcp

Usage:
  agent-cost-mcp <session.jsonl> [--subagent <subagent.jsonl> ...] [--watch] [--watch-interval <seconds>]
  agent-cost-mcp statusline [--format zsh|bash|tmux] <session.jsonl>
  agent-cost-mcp --help

Options:
  --subagent <path>        Include an additional subagent session log in the summary.
  --watch                  Re-scan the target logs on an interval and print refreshed summaries.
  --watch-interval <secs>  Watch refresh interval in seconds. Default: 5.
  --format <shell>         Statusline output format. Default: zsh.
  --help                   Show this help text.

Output:
  Summary mode prints JSON. Statusline mode prints a compact one-line shell summary.`);
}

export function parseArgs(argv: string[]): CliOptions {
  const subagentPaths: string[] = [];
  let sessionPath: string | undefined;
  let help = false;
  let watch = false;
  let watchIntervalMs = 5000;
  let format: 'zsh' | 'bash' | 'tmux' = 'zsh';
  let command: 'summary' | 'statusline' = 'summary';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === 'statusline') {
      command = 'statusline';
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--watch') {
      watch = true;
      continue;
    }
    if (arg === '--format') {
      const next = argv[index + 1] as CliOptions['format'] | undefined;
      if (!next || !['zsh', 'bash', 'tmux'].includes(next)) {
        throw new Error('--format must be one of: zsh, bash, tmux');
      }
      format = next;
      index += 1;
      continue;
    }
    if (arg === '--watch-interval') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('Missing value for --watch-interval');
      }
      const seconds = Number(next);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error('--watch-interval must be a positive number of seconds');
      }
      watchIntervalMs = Math.round(seconds * 1000);
      index += 1;
      continue;
    }
    if (arg === '--subagent') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('Missing value for --subagent');
      }
      subagentPaths.push(next);
      index += 1;
      continue;
    }
    if (!sessionPath) {
      sessionPath = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { command, sessionPath, subagentPaths, help, watch, watchIntervalMs, format };
}

function renderSummary(summary: unknown, watch = false): string {
  const body = JSON.stringify(summary, null, 2);
  if (!watch) {
    return body;
  }
  return `${new Date().toISOString()}
${body}`;
}

function readBudgetState(): BudgetState | null {
  const statePath = path.join(os.homedir(), '.agent-cost-mcp', 'budget-state.json');
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as BudgetState;
  } catch {
    return null;
  }
}

export function renderStatusline(
  summary: {
    turns: unknown[];
    totals: { estimated_cost_usd: number; tool_use_count: number };
  },
  budgetState: BudgetState | null,
  _format: 'zsh' | 'bash' | 'tmux',
): string {
  const cost = `$${summary.totals.estimated_cost_usd.toFixed(2)}`;
  const turns = Math.max(summary.turns.length, 1);
  const toolsPerSession = Math.round(summary.totals.tool_use_count / turns);
  const parts = [cost];

  if (budgetState?.daily_usd && budgetState.daily_usd > 0) {
    const dailyPct = Math.round((summary.totals.estimated_cost_usd / budgetState.daily_usd) * 100);
    parts.push(`${dailyPct}% daily`);
  }

  parts.push(`${toolsPerSession}tps`);

  const line = parts.join(' • ');
  return line.length < 80 ? line : `${cost} • ${toolsPerSession}tps`;
}

export async function runWatchMode(options: WatchModeOptions): Promise<void> {
  const summarize = options.summarize ?? summarizeSessionLogs;
  const print = options.print ?? console.log;
  const debounceMs = Math.max(100, options.watchIntervalMs);
  const createWatcher = options.createWatcher ?? ((targetPath: string, onChange: () => void) => {
    const watcher: FSWatcher = watch(targetPath, { persistent: true }, () => onChange());
    return { close: () => watcher.close() };
  });
  const waitForExit = options.waitForExit ?? (() => new Promise<void>(() => {}));

  const watchers: Array<{ close(): void }> = [];
  let debounceTimer: NodeJS.Timeout | null = null;
  let lastSummaryBody = '';
  let refreshInFlight: Promise<void> | null = null;

  const refresh = async () => {
    if (refreshInFlight) {
      await refreshInFlight;
      return;
    }
    refreshInFlight = (async () => {
      const summary = summarize(options.sessionPath, options.subagentPaths);
      const summaryBody = JSON.stringify(summary, null, 2);
      if (summaryBody !== lastSummaryBody) {
        print(`${new Date().toISOString()}\n${summaryBody}`);
        lastSummaryBody = summaryBody;
      }
    })();
    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  };

  const scheduleRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refresh();
    }, debounceMs);
  };

  await refresh();

  for (const targetPath of [options.sessionPath, ...options.subagentPaths]) {
    if (!existsSync(targetPath)) continue;
    watchers.push(createWatcher(targetPath, scheduleRefresh));
  }

  try {
    await waitForExit();
  } finally {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const watcher of watchers) watcher.close();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const { command, sessionPath, subagentPaths, help, watch, watchIntervalMs, format } = parseArgs(argv);
    if (help || !sessionPath) {
      printHelp();
      return help ? 0 : 1;
    }

    if (watch) {
      await runWatchMode({ sessionPath, subagentPaths, watchIntervalMs });
      return 0;
    }

    const summary = summarizeSessionLogs(sessionPath, subagentPaths);
    if (command === 'statusline') {
      console.log(renderStatusline(summary, readBudgetState(), format));
      return 0;
    }

    console.log(renderSummary(summary));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`agent-cost-mcp: ${message}`);
    console.error('Run `agent-cost-mcp --help` for usage.');
    return 1;
  }
}

const entrypointPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const currentPath = fileURLToPath(import.meta.url);

if (entrypointPath === currentPath) {
  main().then((code) => {
    process.exit(code);
  });
}
