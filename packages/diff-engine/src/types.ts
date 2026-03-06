import type { JsonValue } from "@agenttape/core";

export type DiffSeverity = "none" | "minor" | "major" | "breaking";

export interface DiffOptions {
  ignoreTimestamps: boolean;
  ignoreUsage: boolean;
  ignoreFinalOutput: boolean;
  checkToolSequence: boolean;
  checkToolArgs: boolean;
  checkToolResults: boolean;
  checkLlmFinishReason: boolean;
}

export interface DiffItem {
  kind: string;
  severity: DiffSeverity;
  message: string;
  path?: string;
  baseline?: JsonValue;
  current?: JsonValue;
}

export interface DiffCounts {
  baselineEvents: number;
  currentEvents: number;
  baselineLlmCalls: number;
  currentLlmCalls: number;
  baselineToolCalls: number;
  currentToolCalls: number;
  differences: number;
}

export interface DiffMetadata {
  baselineRunId: string;
  currentRunId: string;
  baselineStatus: "success" | "failed" | "unknown";
  currentStatus: "success" | "failed" | "unknown";
}

export interface DiffReport {
  changed: boolean;
  severity: DiffSeverity;
  summary: string;
  differences: DiffItem[];
  counts: DiffCounts;
  metadata: DiffMetadata;
}

export interface LlmDecision {
  index: number;
  responseId: string | null;
  outputText: string | null;
  finishReason: string | null;
  usage: JsonValue | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: JsonValue;
  }>;
}

export interface ToolInteraction {
  index: number;
  tool: string;
  callId: string | null;
  args: JsonValue | null;
  ok: boolean | null;
  result: JsonValue | null;
  error: string | null;
}
