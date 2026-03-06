import type { JsonValue, TapeEventLine } from "@agenttape/core";

export type ReplayMode = "full" | "tools-only" | "llm-only" | "hybrid";

export interface ReplayLoadResult {
  tapePath: string;
  runId: string;
  command: string;
  events: TapeEventLine[];
  expectedLlmCalls: number;
  expectedToolCalls: number;
  expectedTerminalEvents: number;
}

export interface ReplaySummary {
  tapePath: string;
  mode: ReplayMode;
  status: "success" | "failed";
  replayedLlmCalls: number;
  replayedToolCalls: number;
  durationMs: number;
  mismatches: number;
}

export interface InvariantResult {
  name: string;
  ok: boolean;
  details: string;
}

export interface ReplaySessionStats {
  replayedLlmCalls: number;
  replayedToolCalls: number;
  terminalEventsSeen: number;
}

export interface ReplayedToolResult {
  ok: boolean;
  result?: JsonValue;
  error?: string;
}

export interface ReplayedLlmResult {
  responseId: string | null;
  outputText: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: JsonValue;
  }>;
}
