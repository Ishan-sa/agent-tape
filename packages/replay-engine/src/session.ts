import type { JsonValue, TapeEventLine, TapeEventType } from "@agenttape/core";

import { ReplayMismatchError, mismatch } from "./errors.js";
import type {
  ReplayLoadResult,
  ReplaySessionStats,
  ReplayedLlmResult,
  ReplayedToolResult,
} from "./types.js";

function asRecord(value: JsonValue, context: string): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    mismatch(`${context}: expected object payload`);
  }
  return value as Record<string, JsonValue>;
}

function asString(value: JsonValue | undefined, context: string): string {
  if (typeof value !== "string") {
    mismatch(`${context}: expected string`);
  }
  return value;
}

function asNullableString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: JsonValue | undefined, context: string): boolean {
  if (typeof value !== "boolean") {
    mismatch(`${context}: expected boolean`);
  }
  return value;
}

function asArray(value: JsonValue | undefined, context: string): JsonValue[] {
  if (!Array.isArray(value)) {
    mismatch(`${context}: expected array`);
  }
  return value;
}

function stringify(value: JsonValue): string {
  return JSON.stringify(value);
}

export class ReplaySession {
  private cursor: number;
  private readonly events: TapeEventLine[];
  private readonly stats: ReplaySessionStats;
  private firstMismatch: ReplayMismatchError | undefined;

  constructor(private readonly tape: ReplayLoadResult) {
    this.events = tape.events;
    this.cursor = 1;
    this.stats = {
      replayedLlmCalls: 0,
      replayedToolCalls: 0,
      terminalEventsSeen: 0,
    };
  }

  private peek(): TapeEventLine | undefined {
    return this.events[this.cursor];
  }

  private consumeExpected(expectedType: TapeEventType): TapeEventLine {
    const event = this.peek();
    if (!event) {
      mismatch(`Missing recorded result: expected ${expectedType}, reached end of tape`);
    }

    if (event.eventType !== expectedType) {
      mismatch(`Unexpected event type: expected ${expectedType}, found ${event.eventType}`);
    }

    this.cursor += 1;
    return event;
  }

  private captureMismatch(error: unknown): never {
    if (error instanceof ReplayMismatchError) {
      if (!this.firstMismatch) {
        this.firstMismatch = error;
      }
      throw error;
    }
    throw error;
  }

  replayLlmCall(requestPayload: JsonValue): ReplayedLlmResult {
    try {
      const started = this.consumeExpected("llm_call_started");
      const startedPayload = asRecord(started.payload, "llm_call_started payload");
      const runtimePayload = asRecord(requestPayload, "runtime llm payload");

    const expectedModel = asString(startedPayload.model, "llm_call_started.model");
    const runtimeModel = asString(runtimePayload.model, "runtime llm model");
    if (expectedModel !== runtimeModel) {
      mismatch(`Unexpected model call: expected ${expectedModel}, got ${runtimeModel}`);
    }

    const expectedHasTools = asBoolean(startedPayload.hasTools, "llm_call_started.hasTools");
    const runtimeHasTools = asBoolean(runtimePayload.hasTools, "runtime llm hasTools");
    if (expectedHasTools !== runtimeHasTools) {
      mismatch(
        `Unexpected llm tool-mode: expected hasTools=${String(expectedHasTools)}, got hasTools=${String(runtimeHasTools)}`,
      );
    }

    const completed = this.consumeExpected("llm_call_completed");
    const completedPayload = asRecord(completed.payload, "llm_call_completed payload");
    const toolCallsRaw = asArray(completedPayload.toolCalls, "llm_call_completed.toolCalls");

    const toolCalls = toolCallsRaw.map((raw, index) => {
      const entry = asRecord(raw as JsonValue, `llm_call_completed.toolCalls[${index}]`);
      return {
        id: asString(entry.id, `llm_call_completed.toolCalls[${index}].id`),
        name: asString(entry.name, `llm_call_completed.toolCalls[${index}].name`),
        arguments: (entry.arguments ?? null) as JsonValue,
      };
    });

      this.stats.replayedLlmCalls += 1;

      return {
        responseId: asNullableString(completedPayload.responseId),
        outputText: asNullableString(completedPayload.outputText),
        toolCalls,
      };
    } catch (error) {
      this.captureMismatch(error);
    }
  }

  replayToolCall(toolName: string, args: JsonValue, callId?: string): ReplayedToolResult {
    try {
      const started = this.consumeExpected("tool_call_started");
      const startedPayload = asRecord(started.payload, "tool_call_started payload");

    const expectedTool = asString(startedPayload.tool, "tool_call_started.tool");
    if (expectedTool !== toolName) {
      mismatch(`Unexpected tool name: expected ${expectedTool}, got ${toolName}`);
    }

    if (startedPayload.call_id !== undefined) {
      const expectedCallId = asString(startedPayload.call_id, "tool_call_started.call_id");
      if (callId !== expectedCallId) {
        mismatch(`Unexpected call_id: expected ${expectedCallId}, got ${callId ?? "<missing>"}`);
      }
    }

    if (startedPayload.args !== undefined && stringify(startedPayload.args) !== stringify(args)) {
      mismatch(`Unexpected tool args for ${toolName}`);
    }

    const completed = this.consumeExpected("tool_call_completed");
    const completedPayload = asRecord(completed.payload, "tool_call_completed payload");

    const completedTool = asString(completedPayload.tool, "tool_call_completed.tool");
    if (completedTool !== toolName) {
      mismatch(`Unexpected tool completion: expected ${toolName}, got ${completedTool}`);
    }

    if (completedPayload.call_id !== undefined) {
      const expectedCallId = asString(completedPayload.call_id, "tool_call_completed.call_id");
      if (callId !== expectedCallId) {
        mismatch(`Unexpected call_id: expected ${expectedCallId}, got ${callId ?? "<missing>"}`);
      }
    }

      const ok = asBoolean(completedPayload.ok, "tool_call_completed.ok");
      this.stats.replayedToolCalls += 1;

      if (!ok) {
        const error = asNullableString(completedPayload.error) ?? "Recorded tool call failed";
        return { ok: false, error };
      }

      if (!("result" in completedPayload)) {
        mismatch(`Missing recorded result for tool ${toolName}`);
      }

      return {
        ok: true,
        result: completedPayload.result as JsonValue,
      };
    } catch (error) {
      this.captureMismatch(error);
    }
  }

  recordRuntimeEvent(eventType: TapeEventType): void {
    try {
      if (eventType !== "run_completed" && eventType !== "run_failed") {
        mismatch(`Unexpected runtime event in replay mode: ${eventType}`);
      }

      const terminal = this.consumeExpected(eventType);
      if (terminal.eventType !== eventType) {
        mismatch(`Unexpected terminal event: expected ${eventType}, got ${terminal.eventType}`);
      }

      this.stats.terminalEventsSeen += 1;
    } catch (error) {
      this.captureMismatch(error);
    }
  }

  finalize(): ReplaySessionStats {
    if (this.firstMismatch) {
      throw this.firstMismatch;
    }

    if (this.stats.terminalEventsSeen !== 1) {
      mismatch(`Expected exactly one terminal event during replay, saw ${this.stats.terminalEventsSeen}`);
    }

    if (this.cursor !== this.events.length) {
      const next = this.peek();
      mismatch(
        `Extra runtime call or incomplete replay: ${this.events.length - this.cursor} events were not consumed; next expected ${next?.eventType ?? "<none>"}`,
      );
    }

    return { ...this.stats };
  }
}
