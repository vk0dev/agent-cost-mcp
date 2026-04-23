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
