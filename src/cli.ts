#!/usr/bin/env node
import { summarizeSessionLogs } from './parser.js';

function printHelp(): void {
  console.log(`agent-cost-mcp

Usage:
  agent-cost-mcp <session.jsonl> [--subagent <subagent.jsonl> ...]
  agent-cost-mcp --help

Options:
  --subagent <path>   Include an additional subagent session log in the summary.
  --help              Show this help text.

Output:
  Prints a JSON summary with turn counts, token totals, and estimated cost.`);
}

function parseArgs(argv: string[]): { sessionPath?: string; subagentPaths: string[]; help: boolean } {
  const subagentPaths: string[] = [];
  let sessionPath: string | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
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

  return { sessionPath, subagentPaths, help };
}

function main(): void {
  try {
    const { sessionPath, subagentPaths, help } = parseArgs(process.argv.slice(2));
    if (help || !sessionPath) {
      printHelp();
      process.exit(help ? 0 : 1);
    }

    const summary = summarizeSessionLogs(sessionPath, subagentPaths);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`agent-cost-mcp: ${message}`);
    console.error('Run `agent-cost-mcp --help` for usage.');
    process.exit(1);
  }
}

main();
