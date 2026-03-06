export const AGENT_TAPE_FORMAT_V1 = "agenttape.v1" as const;

export type AgentTapeFormatVersion = typeof AGENT_TAPE_FORMAT_V1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type TapeEventType =
  | "run_started"
  | "llm_call_started"
  | "llm_call_completed"
  | "tool_call_started"
  | "tool_call_completed"
  | "run_completed"
  | "run_failed";

export interface TapeMetadataLine {
  lineType: "meta";
  format: AgentTapeFormatVersion;
  runId: string;
  createdAt: string;
  agent?: string;
  source?: string;
  tags?: Record<string, string>;
}

export interface TapeRedactionSummary {
  count: number;
  keys: string[];
}

export interface TapeEventLine {
  lineType: "event";
  id: string;
  runId: string;
  sequence: number;
  timestamp: string;
  eventType: TapeEventType;
  payload: JsonValue;
  redaction?: TapeRedactionSummary;
}

export type TapeLine = TapeMetadataLine | TapeEventLine;

export interface TapeWriteOptions {
  overwrite?: boolean;
  redaction?: RedactOptions;
}

export interface TapeWriteEventInput {
  eventType: TapeEventType;
  payload: JsonValue;
  timestamp?: string;
  id?: string;
}

export interface RedactionRule {
  path?: string;
  key?: string;
  pattern?: string | RegExp;
  replacement?: string;
}

export interface RedactOptions {
  rules: RedactionRule[];
  defaultReplacement?: string;
  caseInsensitiveKeys?: boolean;
}

export interface RedactionRecord {
  path: string;
  rule: "path" | "key" | "pattern";
  key?: string;
}

export interface RedactResult<T extends JsonValue> {
  value: T;
  records: RedactionRecord[];
}
