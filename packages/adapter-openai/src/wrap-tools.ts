import type { JsonValue, TapeEventType } from "@agenttape/core";

import { getReplayMode, getReplaySessionFromEnv } from "./replay-runtime.js";
import type { ToolHandler, WrappedTools } from "./types.js";

interface EventSink {
  record(eventType: TapeEventType, payload: JsonValue): Promise<void>;
}

function safeValue(input: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(input)) as JsonValue;
  } catch {
    return { nonSerializable: true, type: typeof input };
  }
}

export function wrapTools<T extends Record<string, ToolHandler>>(
  tools: T,
  sink: EventSink,
): WrappedTools<T> {
  const wrappedEntries = Object.entries(tools).map(([name, handler]) => {
    const wrapped: ToolHandler = async (args, context) => {
      const replaySession = await getReplaySessionFromEnv();
      if (replaySession) {
        const mode = getReplayMode();
        if (mode !== "full") {
          throw new Error(`Replay mode ${mode} is not implemented yet. Use --mode full.`);
        }

        const replayed = replaySession.replayToolCall(name, safeValue(args), context?.callId);
        if (!replayed.ok) {
          throw new Error(replayed.error ?? `Recorded tool call failed: ${name}`);
        }
        return replayed.result ?? null;
      }

      await sink.record("tool_call_started", {
        tool: name,
        call_id: context?.callId ?? null,
        args: safeValue(args),
      });

      try {
        const result = await handler(args, context);
        await sink.record("tool_call_completed", {
          tool: name,
          call_id: context?.callId ?? null,
          ok: true,
          result: safeValue(result),
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sink.record("tool_call_completed", {
          tool: name,
          call_id: context?.callId ?? null,
          ok: false,
          error: message,
        });
        throw error;
      }
    };

    return [name, wrapped] as const;
  });

  return Object.fromEntries(wrappedEntries) as WrappedTools<T>;
}
