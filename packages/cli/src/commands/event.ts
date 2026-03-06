import { resolve } from "node:path";

import { TapeWriter, type JsonValue, type TapeEventType } from "@agenttape/core";

interface EventEnvelope {
  eventType: TapeEventType;
  payload: JsonValue;
}

const ALLOWED_EVENT_TYPES: Set<TapeEventType> = new Set([
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

function parseEnvelope(raw: string): EventEnvelope {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Event payload must be a JSON object");
  }

  const eventType = (parsed as Record<string, unknown>).eventType;
  const payload = (parsed as Record<string, unknown>).payload;

  if (typeof eventType !== "string" || !ALLOWED_EVENT_TYPES.has(eventType as TapeEventType)) {
    throw new Error(`Unsupported eventType: ${String(eventType)}`);
  }

  return {
    eventType: eventType as TapeEventType,
    payload: (payload ?? null) as JsonValue,
  };
}

export async function runEvent(payloadJson: string, tapePathArg?: string): Promise<number> {
  const tapePath = tapePathArg ?? process.env.AGENTTAPE_TAPE_PATH;
  if (!tapePath) {
    throw new Error("Tape path not provided. Use --tape or AGENTTAPE_TAPE_PATH.");
  }

  const envelope = parseEnvelope(payloadJson);
  const writer = await TapeWriter.openForAppend(resolve(tapePath));
  await writer.writeEvent(envelope);
  await writer.close();

  return 0;
}
