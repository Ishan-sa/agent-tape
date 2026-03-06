#!/usr/bin/env node
import { createInterface } from "node:readline";

import { appendClaudeEvent } from "./events.js";
import type { JsonValue } from "@agenttape/core";

interface RequestMessage {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

function toJsonValue(value: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
  } catch {
    return null;
  }
}

function response(id: string | number | undefined, result: unknown): string {
  return JSON.stringify({ id, result });
}

function error(id: string | number | undefined, message: string): string {
  return JSON.stringify({ id, error: { message } });
}

function tapePathFromEnv(): string {
  const tapePath = process.env.AGENTTAPE_TAPE_PATH;
  if (!tapePath) {
    throw new Error("AGENTTAPE_TAPE_PATH is required for agenttape-claude-mcp");
  }
  return tapePath;
}

async function handleRequest(msg: RequestMessage): Promise<unknown> {
  const tapePath = tapePathFromEnv();
  const params = msg.params ?? {};

  switch (msg.method) {
    case "record_read_file": {
      await appendClaudeEvent(tapePath, {
        eventType: "read_file",
        payload: {
          path: toJsonValue(params.path),
        },
      });
      return { ok: true };
    }
    case "record_write_file": {
      await appendClaudeEvent(tapePath, {
        eventType: "write_file",
        payload: {
          path: toJsonValue(params.path),
          bytes: toJsonValue(params.bytes),
        },
      });
      return { ok: true };
    }
    case "record_run_command": {
      await appendClaudeEvent(tapePath, {
        eventType: "run_command",
        payload: {
          command: toJsonValue(params.command),
          exitCode: toJsonValue(params.exitCode),
        },
      });
      return { ok: true };
    }
    case "record_tool_call": {
      const phase = params.phase === "completed" ? "tool_call_completed" : "tool_call_started";
      await appendClaudeEvent(tapePath, {
        eventType: phase,
        payload: {
          tool: toJsonValue(params.tool),
          call_id: toJsonValue(params.call_id),
          args: toJsonValue(params.args),
          result: toJsonValue(params.result),
          ok: toJsonValue(params.ok),
        },
      });
      return { ok: true };
    }
    default:
      throw new Error(`Unsupported method: ${msg.method}`);
  }
}

async function main(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let req: RequestMessage;
    try {
      req = JSON.parse(trimmed) as RequestMessage;
    } catch {
      process.stdout.write(error(undefined, "Invalid JSON") + "\n");
      continue;
    }

    try {
      const result = await handleRequest(req);
      process.stdout.write(response(req.id, result) + "\n");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      process.stdout.write(error(req.id, message) + "\n");
    }
  }
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
