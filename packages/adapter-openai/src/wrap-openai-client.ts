import type { JsonValue, TapeEventType } from "@agenttape/core";

import { getReplayMode, getReplaySessionFromEnv } from "./replay-runtime.js";
import type { OpenAIRequest, OpenAIResponse, OpenAIStyleClient } from "./types.js";

interface EventSink {
  record(eventType: TapeEventType, payload: JsonValue): Promise<void>;
}

function toJsonValue(input: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(input)) as JsonValue;
  } catch {
    return { nonSerializable: true, type: typeof input };
  }
}

function requestSnapshot(request: OpenAIRequest): JsonValue {
  return {
    model: request.model,
    hasTools: Array.isArray(request.tools),
    input: toJsonValue(request.input),
  };
}

function responseSnapshot(response: OpenAIResponse): JsonValue {
  const toolCalls = Array.isArray(response.tool_calls)
    ? response.tool_calls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: toJsonValue(toolCall.arguments),
      }))
    : [];

  return {
    responseId: response.id ?? null,
    outputText: response.output_text ?? null,
    toolCallCount: toolCalls.length,
    toolCalls,
  };
}

export function wrapOpenAIClient<TClient extends OpenAIStyleClient>(
  client: TClient,
  sink: EventSink,
): TClient {
  const wrapped: OpenAIStyleClient = {
    ...client,
    responses: {
      ...client.responses,
      async create(request: OpenAIRequest): Promise<OpenAIResponse> {
        const replaySession = await getReplaySessionFromEnv();
        if (replaySession) {
          const mode = getReplayMode();
          if (mode !== "full") {
            throw new Error(`Replay mode ${mode} is not implemented yet. Use --mode full.`);
          }

          const replayed = replaySession.replayLlmCall(requestSnapshot(request));
          return {
            ...(replayed.responseId !== null ? { id: replayed.responseId } : {}),
            ...(replayed.outputText !== null ? { output_text: replayed.outputText } : {}),
            tool_calls: replayed.toolCalls,
          };
        }

        await sink.record("llm_call_started", requestSnapshot(request));

        try {
          const response = await client.responses.create(request);
          await sink.record("llm_call_completed", responseSnapshot(response));
          return response;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await sink.record("run_failed", {
            reason: "llm_call_error",
            error: message,
          });
          throw error;
        }
      },
    },
  };

  return wrapped as TClient;
}
