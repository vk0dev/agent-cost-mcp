import { describe, expect, it, vi } from 'vitest';

import { parseArgs, runWatchMode } from '../src/cli.js';

describe('parseArgs', () => {
  it('keeps default behavior without watch mode', () => {
    expect(parseArgs(['session.jsonl'])).toEqual({
      sessionPath: 'session.jsonl',
      subagentPaths: [],
      help: false,
      watch: false,
      watchIntervalMs: 5000,
    });
  });

  it('parses watch flags and subagents', () => {
    expect(parseArgs(['session.jsonl', '--subagent', 'child.jsonl', '--watch', '--watch-interval', '2'])).toEqual({
      sessionPath: 'session.jsonl',
      subagentPaths: ['child.jsonl'],
      help: false,
      watch: true,
      watchIntervalMs: 2000,
    });
  });
});

describe('runWatchMode', () => {
  it('prints refreshed summaries on each iteration', async () => {
    const summarize = vi.fn()
      .mockReturnValueOnce({ totalCostUsd: 1 })
      .mockReturnValueOnce({ totalCostUsd: 2 });
    const print = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);

    await runWatchMode({
      sessionPath: 'session.jsonl',
      subagentPaths: [],
      watchIntervalMs: 10,
      summarize,
      print,
      sleep,
      maxIterations: 2,
    });

    expect(summarize).toHaveBeenCalledTimes(2);
    expect(print).toHaveBeenCalledTimes(2);
    expect(print.mock.calls[0][0]).toContain('"totalCostUsd": 1');
    expect(print.mock.calls[1][0]).toContain('"totalCostUsd": 2');
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
