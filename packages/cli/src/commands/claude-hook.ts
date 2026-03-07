import { resolve } from "node:path";

import { TapeWriter, type JsonValue } from "@agenttape/core";

// ─── Claude Code hook payload shapes ─────────────────────────────────────────
// Claude Code pipes a JSON object to stdin for every hook invocation.

interface ClaudeHookPayload {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolvePromise(data);
    });
    process.stdin.on("error", reject);
  });
}

function toJsonValue(v: unknown): JsonValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  try {
    return JSON.parse(JSON.stringify(v)) as JsonValue;
  } catch {
    return String(v);
  }
}

function strFrom(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

// ─── main handler ─────────────────────────────────────────────────────────────

export async function runClaudeHook(): Promise<number> {
  // If not inside an agenttape recording session, exit silently.
  // This makes the hook safe to install globally — it no-ops outside recordings.
  const tapePath = process.env.AGENTTAPE_TAPE_PATH;
  if (!tapePath) return 0;

  const raw = await readStdin();
  if (!raw.trim()) return 0;

  let payload: ClaudeHookPayload;
  try {
    payload = JSON.parse(raw) as ClaudeHookPayload;
  } catch {
    // Malformed stdin — ignore rather than crashing
    return 0;
  }

  const hookEvent = payload.hook_event_name ?? "";
  const toolName = payload.tool_name ?? "";
  const toolInput = payload.tool_input ?? {};
  const toolResponse = payload.tool_response ?? {};

  // We only act on PostToolUse. PreToolUse would add redundant noise.
  if (hookEvent !== "PostToolUse") return 0;

  let writer: TapeWriter | undefined;
  try {
    writer = await TapeWriter.openForAppend(resolve(tapePath));

    if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
      const filePath = strFrom(toolInput.file_path ?? toolInput.path ?? "");
      await writer.writeEvent({
        eventType: "file_written",
        payload: {
          path: filePath,
          tool: toolName,
          source: "claude-code-hook",
        },
      });
    } else if (toolName === "Bash") {
      const command = strFrom(toolInput.command ?? "");
      const exitCodeRaw = toolResponse.exit_code ?? toolResponse.exitCode;
      const exitCode = typeof exitCodeRaw === "number" ? exitCodeRaw : 0;
      await writer.writeEvent({
        eventType: "command_executed",
        payload: {
          tool: "Bash",
          command,
          exitCode: toJsonValue(exitCode),
          source: "claude-code-hook",
        },
      });
    } else if (toolName === "Read") {
      const filePath = strFrom(toolInput.file_path ?? toolInput.path ?? "");
      await writer.writeEvent({
        eventType: "read_file",
        payload: {
          path: filePath,
          tool: "Read",
          source: "claude-code-hook",
        },
      });
    } else {
      // Generic tool — record as a completed tool call
      await writer.writeEvent({
        eventType: "tool_call_completed",
        payload: {
          tool: toolName,
          args: toJsonValue(toolInput),
          result: toJsonValue(toolResponse),
          ok: true,
          source: "claude-code-hook",
        },
      });
    }
  } finally {
    await writer?.close();
  }

  return 0;
}
