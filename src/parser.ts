import { readFileSync } from 'node:fs';
import path from 'node:path';

import { estimateCostUsd, DEFAULT_PRICING_TABLE } from './pricing.js';
import type { ParsedTurn, Pricing, SessionSummary, ToolUseRecord, Usage } from './types.js';

type JsonRecord = Record<string, unknown>;

type AssistantAccumulator = {
  turnIndex: number;
  assistantId?: string;
  model: string;
  usage: Usage;
  toolUses: ToolUseRecord[];
  toolResultCount: number;
  linkedToolResultIds: Set<string>;
  sourceFiles: Set<string>;
};

function emptyUsage(): Usage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

function addUsage(target: Usage, raw: Partial<Usage> | undefined): void {
  if (!raw) return;
  target.input_tokens += Number(raw.input_tokens ?? 0);
  target.output_tokens += Number(raw.output_tokens ?? 0);
  target.cache_read_input_tokens += Number(raw.cache_read_input_tokens ?? 0);
  target.cache_creation_input_tokens += Number(raw.cache_creation_input_tokens ?? 0);
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function normalizeMessage(raw: JsonRecord): { type: string; uuid?: string; parentUuid?: string; model?: string; usage?: Partial<Usage>; message?: JsonRecord } {
  const type = String(raw.type ?? raw.message_type ?? raw.role ?? '');
  const message = asRecord(raw.message) ?? raw;
  const usage = asRecord(raw.usage) ?? asRecord(message.usage);
  return {
    type,
    uuid: String(raw.uuid ?? message.uuid ?? raw.id ?? '' ) || undefined,
    parentUuid: String(raw.parentUuid ?? raw.parent_uuid ?? message.parentUuid ?? '' ) || undefined,
    model: String(raw.model ?? message.model ?? '' ) || undefined,
    usage: usage as Partial<Usage> | undefined,
    message,
  };
}

function extractContentItems(message: JsonRecord): JsonRecord[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  return content.map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];
}

function parseJsonlFile(filePath: string, startTurn: number): { turns: ParsedTurn[]; nextTurn: number } {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const turns: ParsedTurn[] = [];
  const assistantById = new Map<string, AssistantAccumulator>();
  let turnCounter = startTurn;
  let currentAssistantId: string | undefined;

  for (const line of lines) {
    const raw = JSON.parse(line) as JsonRecord;
    const msg = normalizeMessage(raw);
    const lowerType = msg.type.toLowerCase();

    if (lowerType.includes('assistant')) {
      const assistantId = msg.uuid;
      const accumulator: AssistantAccumulator = {
        turnIndex: turnCounter++,
        assistantId,
        model: msg.model ?? 'unknown',
        usage: emptyUsage(),
        toolUses: [],
        toolResultCount: 0,
        linkedToolResultIds: new Set<string>(),
        sourceFiles: new Set([filePath]),
      };
      addUsage(accumulator.usage, msg.usage);

      for (const item of extractContentItems(msg.message ?? raw)) {
        if (item.type === 'tool_use') {
          accumulator.toolUses.push({
            id: String(item.id ?? ''),
            name: String(item.name ?? '' ) || undefined,
          });
        }
      }

      if (assistantId) assistantById.set(assistantId, accumulator);
      currentAssistantId = assistantId;
      turns.push({
        turnIndex: accumulator.turnIndex,
        assistantId,
        model: accumulator.model,
        usage: { ...accumulator.usage },
        toolUseCount: accumulator.toolUses.length,
        toolResultCount: 0,
        linkedToolResultCount: 0,
        sourceFiles: [filePath],
      });
      continue;
    }

    const targetId = String(raw.sourceToolAssistantUUID ?? msg.parentUuid ?? currentAssistantId ?? '') || undefined;
    const target = targetId ? assistantById.get(targetId) : undefined;
    if (!target) continue;

    target.sourceFiles.add(filePath);

    if (lowerType.includes('user')) {
      for (const item of extractContentItems(msg.message ?? raw)) {
        if (item.type === 'tool_result') {
          target.toolResultCount += 1;
          const toolUseId = String(item.tool_use_id ?? item.toolUseId ?? '' ) || undefined;
          if (toolUseId && target.toolUses.some((tool) => tool.id === toolUseId)) {
            target.linkedToolResultIds.add(toolUseId);
          }
        }
      }
    }
  }

  return {
    turns: turns.map((turn) => {
      const acc = turn.assistantId ? assistantById.get(turn.assistantId) : undefined;
      return acc
        ? {
            ...turn,
            usage: { ...acc.usage },
            toolUseCount: acc.toolUses.length,
            toolResultCount: acc.toolResultCount,
            linkedToolResultCount: acc.linkedToolResultIds.size,
            sourceFiles: [...acc.sourceFiles],
          }
        : turn;
    }),
    nextTurn: turnCounter,
  };
}

export function summarizeSessionLogs(
  sessionPath: string,
  subagentPaths: string[] = [],
  pricingTable: Record<string, Pricing> = DEFAULT_PRICING_TABLE,
): SessionSummary {
  let nextTurn = 1;
  const primary = parseJsonlFile(sessionPath, nextTurn);
  nextTurn = primary.nextTurn;
  const subTurns = subagentPaths.flatMap((subPath) => {
    const parsed = parseJsonlFile(subPath, nextTurn);
    nextTurn = parsed.nextTurn;
    return parsed.turns;
  });

  const turns = [...primary.turns, ...subTurns].sort((a, b) => a.turnIndex - b.turnIndex);
  const totals = turns.reduce(
    (acc, turn) => {
      addUsage(acc, turn.usage);
      acc.tool_use_count += turn.toolUseCount;
      acc.tool_result_count += turn.toolResultCount;
      acc.linked_tool_result_count += turn.linkedToolResultCount;
      acc.estimated_cost_usd = Number((acc.estimated_cost_usd + estimateCostUsd(turn.model, turn.usage, pricingTable)).toFixed(6));
      return acc;
    },
    {
      ...emptyUsage(),
      tool_use_count: 0,
      tool_result_count: 0,
      linked_tool_result_count: 0,
      estimated_cost_usd: 0,
    },
  );

  return {
    sessionPath: path.resolve(sessionPath),
    subagentPaths: subagentPaths.map((subPath) => path.resolve(subPath)),
    turns,
    totals,
  };
}
