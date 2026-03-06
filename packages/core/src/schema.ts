import {
  AGENT_TAPE_FORMAT_V1,
  type JsonObject,
  type JsonValue,
  type TapeEventLine,
  type TapeEventType,
  type TapeLine,
  type TapeMetadataLine,
} from "./types.js";
import { isIsoTimestamp } from "./timestamp.js";

const EVENT_TYPES: ReadonlySet<TapeEventType> = new Set([
  "run_started",
  "llm_call_started",
  "llm_call_completed",
  "tool_call_started",
  "tool_call_completed",
  "command_executed",
  "file_written",
  "read_file",
  "write_file",
  "run_command",
  "git_commit",
  "search_repo",
  "run_completed",
  "run_failed",
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (isObject(value)) {
    return Object.values(value).every((entry) => isJsonValue(entry));
  }

  return false;
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${fieldName}: expected non-empty string`);
  }
}

function assertOptionalString(
  value: unknown,
  fieldName: string,
): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName}: expected string`);
  }
}

function assertOptionalTagMap(
  value: unknown,
): asserts value is Record<string, string> | undefined {
  if (value === undefined) {
    return;
  }

  if (!isObject(value)) {
    throw new Error("Invalid meta.tags: expected object map");
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new Error(`Invalid meta.tags.${key}: expected string value`);
    }
  }
}

function assertNoExtraFields(line: JsonObject, allowedFields: string[], lineType: string): void {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(line)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid ${lineType} line: unexpected field \"${key}\"`);
    }
  }
}

export function assertTapeMetadataLine(value: unknown): asserts value is TapeMetadataLine {
  if (!isObject(value)) {
    throw new Error("Invalid tape metadata line: expected object");
  }

  assertNoExtraFields(value, ["lineType", "format", "runId", "createdAt", "agent", "source", "tags"], "meta");

  if (value.lineType !== "meta") {
    throw new Error("Invalid metadata lineType: expected \"meta\"");
  }

  if (value.format !== AGENT_TAPE_FORMAT_V1) {
    throw new Error(`Invalid format: expected \"${AGENT_TAPE_FORMAT_V1}\"`);
  }

  assertString(value.runId, "meta.runId");
  assertString(value.createdAt, "meta.createdAt");

  if (!isIsoTimestamp(value.createdAt)) {
    throw new Error("Invalid meta.createdAt: expected ISO-8601 timestamp");
  }

  assertOptionalString(value.agent, "meta.agent");
  assertOptionalString(value.source, "meta.source");
  assertOptionalTagMap(value.tags);
}

function assertRedactionSummary(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isObject(value)) {
    throw new Error("Invalid event.redaction: expected object");
  }

  assertNoExtraFields(value, ["count", "keys"], "event.redaction");

  if (typeof value.count !== "number" || !Number.isInteger(value.count) || value.count < 0) {
    throw new Error("Invalid event.redaction.count: expected non-negative integer");
  }

  if (!Array.isArray(value.keys) || !value.keys.every((entry) => typeof entry === "string")) {
    throw new Error("Invalid event.redaction.keys: expected string[]");
  }
}

export function assertTapeEventLine(value: unknown): asserts value is TapeEventLine {
  if (!isObject(value)) {
    throw new Error("Invalid tape event line: expected object");
  }

  assertNoExtraFields(
    value,
    ["lineType", "id", "runId", "sequence", "timestamp", "eventType", "payload", "redaction"],
    "event",
  );

  if (value.lineType !== "event") {
    throw new Error("Invalid event lineType: expected \"event\"");
  }

  assertString(value.id, "event.id");
  assertString(value.runId, "event.runId");

  if (typeof value.sequence !== "number" || !Number.isInteger(value.sequence) || value.sequence < 1) {
    throw new Error("Invalid event.sequence: expected positive integer");
  }

  assertString(value.timestamp, "event.timestamp");
  if (!isIsoTimestamp(value.timestamp)) {
    throw new Error("Invalid event.timestamp: expected ISO-8601 timestamp");
  }

  if (typeof value.eventType !== "string" || !EVENT_TYPES.has(value.eventType as TapeEventType)) {
    throw new Error("Invalid event.eventType");
  }

  if (!isJsonValue(value.payload)) {
    throw new Error("Invalid event.payload: expected JSON value");
  }

  assertRedactionSummary(value.redaction);
}

export function assertTapeLine(value: unknown): asserts value is TapeLine {
  if (!isObject(value)) {
    throw new Error("Invalid tape line: expected object");
  }

  if (value.lineType === "meta") {
    assertTapeMetadataLine(value);
    return;
  }

  if (value.lineType === "event") {
    assertTapeEventLine(value);
    return;
  }

  throw new Error("Invalid tape lineType: expected \"meta\" or \"event\"");
}
