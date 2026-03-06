import type { JsonValue, TapeEventLine } from "@agenttape/core";

import type { LlmDecision, ToolInteraction } from "./types.js";
import { asArray, asBoolean, asObject, asString } from "./utils.js";

export function extractTerminalStatus(events: TapeEventLine[]): "success" | "failed" | "unknown" {
  const terminal = events.find(
    (event) => event.eventType === "run_completed" || event.eventType === "run_failed",
  );

  if (!terminal) {
    return "unknown";
  }

  return terminal.eventType === "run_completed" ? "success" : "failed";
}

export function extractFinalOutput(events: TapeEventLine[]): string | null {
  const terminal = events.find(
    (event) => event.eventType === "run_completed" || event.eventType === "run_failed",
  );

  if (!terminal) {
    return null;
  }

  const payload = asObject(terminal.payload);
  if (!payload) {
    return null;
  }

  const answer = asString(payload.answer);
  if (answer) {
    return answer;
  }

  return asString(payload.error);
}

export function extractLlmDecisions(events: TapeEventLine[]): LlmDecision[] {
  const decisions: LlmDecision[] = [];

  let index = 0;
  for (const event of events) {
    if (event.eventType !== "llm_call_completed") {
      continue;
    }

    const payload = asObject(event.payload);
    if (!payload) {
      continue;
    }

    const toolCallsRaw = asArray(payload.toolCalls) ?? [];
    const toolCalls = toolCallsRaw
      .map((entry) => asObject(entry as JsonValue))
      .filter((entry): entry is Record<string, JsonValue> => entry !== undefined)
      .map((entry) => ({
        id: asString(entry.id) ?? "",
        name: asString(entry.name) ?? "",
        arguments: (entry.arguments ?? null) as JsonValue,
      }));

    decisions.push({
      index,
      responseId: asString(payload.responseId),
      outputText: asString(payload.outputText),
      finishReason: asString(payload.finish_reason),
      usage: (payload.usage ?? null) as JsonValue,
      toolCalls,
    });

    index += 1;
  }

  return decisions;
}

export function extractToolInteractions(events: TapeEventLine[]): ToolInteraction[] {
  const interactions: ToolInteraction[] = [];
  let index = 0;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!event) {
      continue;
    }
    if (event.eventType !== "tool_call_started") {
      continue;
    }

    const startedPayload = asObject(event.payload);
    const tool = asString(startedPayload?.tool) ?? "";
    const callId = asString(startedPayload?.call_id);
    const args = (startedPayload?.args ?? null) as JsonValue;

    const next = events[i + 1];
    if (!next || next.eventType !== "tool_call_completed") {
      interactions.push({
        index,
        tool,
        callId,
        args,
        ok: null,
        result: null,
        error: "missing tool_call_completed",
      });
      index += 1;
      continue;
    }

    const completedPayload = asObject(next.payload);

    interactions.push({
      index,
      tool,
      callId,
      args,
      ok: asBoolean(completedPayload?.ok),
      result: (completedPayload?.result ?? null) as JsonValue,
      error: asString(completedPayload?.error),
    });

    i += 1;
    index += 1;
  }

  return interactions;
}
