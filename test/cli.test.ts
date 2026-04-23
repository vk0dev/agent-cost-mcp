import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseArgs, renderStatusline, runWatchMode } from '../src/cli.js';

describe('parseArgs', () => {
  it('keeps default behavior without watch mode', () => {
    expect(parseArgs(['session.jsonl'])).toEqual({
      command: 'summary',
      sessionPath: 'session.jsonl',
      subagentPaths: [],
      help: false,
      watch: false,
      watchIntervalMs: 5000,
      format: 'zsh',
    });
  });

  it('parses watch flags and subagents', () => {
    expect(parseArgs(['session.jsonl', '--subagent', 'child.jsonl', '--watch', '--watch-interval', '2'])).toEqual({
      command: 'summary',
      sessionPath: 'session.jsonl',
      subagentPaths: ['child.jsonl'],
      help: false,
      watch: true,
      watchIntervalMs: 2000,
      format: 'zsh',
    });
  });

  it('parses statusline subcommand with format', () => {
    expect(parseArgs(['statusline', '--format', 'tmux', 'session.jsonl'])).toEqual({
      command: 'statusline',
      sessionPath: 'session.jsonl',
      subagentPaths: [],
      help: false,
      watch: false,
      watchIntervalMs: 5000,
      format: 'tmux',
    });
  });
});

const summary = {
  sessionPath: 'session.jsonl',
  subagentPaths: [],
  turns: [{}, {}, {}],
  totals: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tool_use_count: 9,
    tool_result_count: 9,
    linked_tool_result_count: 9,
    estimated_cost_usd: 2.14,
  },
};

describe('renderStatusline', () => {
  it('renders compact output under 80 chars', () => {
    const line = renderStatusline(summary as any, { daily_usd: 5 }, 'zsh');

    expect(line).toContain('$2.14');
    expect(line).toContain('43% daily');
    expect(line).toContain('3tps');
    expect(line.length).toBeLessThan(80);
  });

  it('omits daily percentage when no budget exists', () => {
    const line = renderStatusline(summary as any, null, 'bash');

    expect(line).toContain('$2.14');
    expect(line).toContain('3tps');
    expect(line).not.toContain('% daily');
  });
});

describe('runWatchMode', () => {
  const summaryA = {
    ...summary,
    totals: {
      ...summary.totals,
      estimated_cost_usd: 1.11,
    },
  };

  const summaryB = {
    ...summary,
    totals: {
      ...summary.totals,
      estimated_cost_usd: 2.22,
    },
  };

  it('does not reprint without file events', async () => {
    const summarize = vi.fn().mockReturnValue(summaryA);
    const print = vi.fn();
    const watcherClosers: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    const sessionPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'agent-cost-watch-')), 'session.jsonl');
    writeFileSync(sessionPath, '{}\n');

    await runWatchMode({
      sessionPath,
      subagentPaths: [],
      watchIntervalMs: 10,
      summarize,
      print,
      createWatcher: () => {
        const watcher = { close: vi.fn() };
        watcherClosers.push(watcher);
        return watcher;
      },
      waitForExit: async () => {},
    });

    expect(print).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(watcherClosers[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('debounces burst file events into one bounded refresh', async () => {
    const summarize = vi.fn()
      .mockReturnValueOnce(summaryA)
      .mockReturnValueOnce(summaryB);
    const print = vi.fn();
    let onChange: (() => void) | undefined;
    let resolveExit: (() => void) | undefined;
    const sessionPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'agent-cost-watch-')), 'session.jsonl');
    writeFileSync(sessionPath, '{}\n');

    const run = runWatchMode({
      sessionPath,
      subagentPaths: [],
      watchIntervalMs: 10,
      summarize,
      print,
      createWatcher: (_path, handler) => {
        onChange = handler;
        return { close: vi.fn() };
      },
      waitForExit: () => new Promise<void>((resolve) => {
        resolveExit = resolve;
      }),
    });

    await Promise.resolve();
    expect(print).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onChange).toBeTypeOf('function'));

    onChange?.();
    onChange?.();
    onChange?.();
    await new Promise((resolve) => setTimeout(resolve, 175));

    expect(print).toHaveBeenCalledTimes(2);
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(print.mock.calls[0][0]).toContain('"estimated_cost_usd": 1.11');
    expect(print.mock.calls[1][0]).toContain('"estimated_cost_usd": 2.22');

    resolveExit?.();
    await run;
  });
});
