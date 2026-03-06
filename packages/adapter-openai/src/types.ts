import type { JsonValue } from "@agenttape/core";

export type RecordEvent = (eventType: string, payload: JsonValue) => Promise<void>;

export type RedactProfile = "default" | "strict" | "off";

export interface OpenAIToolCall {
  id: string;
  name: string;
  arguments: JsonValue;
}

export interface OpenAIResponse {
  id?: string;
  output_text?: string;
  tool_calls?: OpenAIToolCall[];
  [key: string]: unknown;
}

export interface OpenAIRequest {
  model: string;
  input: JsonValue;
  tools?: JsonValue;
  [key: string]: unknown;
}

export interface OpenAIStyleClient {
  responses: {
    create(request: OpenAIRequest): Promise<OpenAIResponse>;
  };
}

export interface ToolCallContext {
  callId?: string;
}

export type ToolHandler = (args: JsonValue, context?: ToolCallContext) => Promise<JsonValue> | JsonValue;

export type WrappedTools<T extends Record<string, ToolHandler>> = {
  [K in keyof T]: ToolHandler;
};
