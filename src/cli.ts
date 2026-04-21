#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { summarizeSessionLogs } from './parser.js';

export type CliOptions = {
  sessionPath?: string;
  subagentPaths: string[];
  help: boolean;
  watch: boolean;
  watchIntervalMs: number;
};

export type WatchModeOptions = {
  sessionPath: string;
  subagentPaths: string[];
  watchIntervalMs: number;
  summarize?: typeof summarizeSessionLogs;
  print?: (text: string) => void;
  sleep?: (ms: number) => Promise<void>;
  maxIterations?: number;
};

function printHelp(): void {
  console.log(`agent-cost-mcp

Usage:
  agent-cost-mcp <session.jsonl> [--subagent <subagent.jsonl> ...] [--watch] [--watch-interval <seconds>]
  agent-cost-mcp --help

Options:
  --subagent <path>        Include an additional subagent session log in the summary.
  --watch                  Re-scan the target logs on an interval and print refreshed summaries.
  --watch-interval <secs>  Watch refresh interval in seconds. Default: 5.
  --help                   Show this help text.

Output:
  Prints a JSON summary with turn counts, token totals, and estimated cost.`);
}

export function parseArgs(argv: string[]): CliOptions {
  const subagentPaths: string[] = [];
  let sessionPath: string | undefined;
  let help = false;
  let watch = false;
  let watchIntervalMs = 5000;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--watch') {
      watch = true;
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

  return { sessionPath, subagentPaths, help, watch, watchIntervalMs };
}

function renderSummary(summary: unknown, watch = false): string {
  const body = JSON.stringify(summary, null, 2);
  if (!watch) {
    return body;
  }
  return `${new Date().toISOString()}\n${body}`;
}

export async function runWatchMode(options: WatchModeOptions): Promise<void> {
  const summarize = options.summarize ?? summarizeSessionLogs;
  const print = options.print ?? console.log;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let iteration = 0;
  while (true) {
    iteration += 1;
    const summary = summarize(options.sessionPath, options.subagentPaths);
    print(renderSummary(summary, true));

    if (options.maxIterations && iteration >= options.maxIterations) {
      return;
    }
    await sleep(options.watchIntervalMs);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const { sessionPath, subagentPaths, help, watch, watchIntervalMs } = parseArgs(argv);
    if (help || !sessionPath) {
      printHelp();
      return help ? 0 : 1;
    }

    if (watch) {
      await runWatchMode({ sessionPath, subagentPaths, watchIntervalMs });
      return 0;
    }

    const summary = summarizeSessionLogs(sessionPath, subagentPaths);
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
