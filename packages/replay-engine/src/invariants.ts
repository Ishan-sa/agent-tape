import type { TapeEventLine } from "@agenttape/core";

import type { InvariantResult } from "./types.js";

export function evaluateInvariants(events: TapeEventLine[]): InvariantResult[] {
  const results: InvariantResult[] = [];

  const terminalEvents = events.filter(
    (event) => event.eventType === "run_completed" || event.eventType === "run_failed",
  );

  results.push({
    name: "exactly_one_terminal_event",
    ok: terminalEvents.length === 1,
    details: `Found ${terminalEvents.length} terminal events`,
  });

  const terminalAtEnd =
    events.length > 0 &&
    (events[events.length - 1]?.eventType === "run_completed" ||
      events[events.length - 1]?.eventType === "run_failed");

  results.push({
    name: "terminal_event_at_end",
    ok: terminalAtEnd,
    details: terminalAtEnd ? "Terminal event is final" : "Terminal event is not final",
  });

  let orderOk = true;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!event) {
      orderOk = false;
      break;
    }
    if (event.eventType === "llm_call_completed") {
      const prev = events[i - 1];
      if (!prev || prev.eventType !== "llm_call_started") {
        orderOk = false;
        break;
      }
    }
    if (event.eventType === "tool_call_completed") {
      const prev = events[i - 1];
      if (!prev || prev.eventType !== "tool_call_started") {
        orderOk = false;
        break;
      }
    }
  }

  results.push({
    name: "paired_start_completed_order",
    ok: orderOk,
    details: orderOk ? "All llm/tool completion events follow starts" : "Found completion without matching start",
  });

  return results;
}
