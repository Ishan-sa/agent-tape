import { readTape, type JsonValue } from "@agenttape/core";

import { mismatch } from "./errors.js";
import type { ReplayLoadResult } from "./types.js";

function readCommandFromRunStart(payload: JsonValue): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    mismatch("Invalid run_started payload: expected object");
  }

  const command = payload.command;
  if (typeof command !== "string" || command.length === 0) {
    mismatch("Invalid run_started payload: missing command");
  }

  return command;
}

export async function loadReplayTape(tapePath: string): Promise<ReplayLoadResult> {
  const tape = await readTape(tapePath);

  if (tape.events.length === 0) {
    mismatch("Tape has no events");
  }

  const first = tape.events[0];
  if (!first) {
    mismatch("Tape has no first event");
  }
  if (first.eventType !== "run_started") {
    mismatch(`Tape must begin with run_started event, found ${first.eventType}`);
  }

  const command = readCommandFromRunStart(first.payload);
  const expectedLlmCalls = tape.events.filter((event) => event.eventType === "llm_call_completed").length;
  const expectedToolCalls = tape.events.filter((event) => event.eventType === "tool_call_completed").length;
  const expectedTerminalEvents = tape.events.filter(
    (event) => event.eventType === "run_completed" || event.eventType === "run_failed",
  ).length;

  return {
    tapePath,
    runId: tape.metadata.runId,
    command,
    events: tape.events,
    expectedLlmCalls,
    expectedToolCalls,
    expectedTerminalEvents,
  };
}
