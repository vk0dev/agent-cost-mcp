export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type ToolUseRecord = {
  id: string;
  name?: string;
};

export type ParsedTurn = {
  turnIndex: number;
  assistantId?: string;
  model: string;
  usage: Usage;
  toolUseCount: number;
  toolResultCount: number;
  linkedToolResultCount: number;
  sourceFiles: string[];
};

export type SessionSummary = {
  sessionPath: string;
  subagentPaths: string[];
  turns: ParsedTurn[];
  totals: Usage & {
    tool_use_count: number;
    tool_result_count: number;
    linked_tool_result_count: number;
    estimated_cost_usd: number;
  };
};

export type Pricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheCreationPerMillion?: number;
};
