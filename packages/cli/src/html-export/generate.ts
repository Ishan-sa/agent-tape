import type { TapeEventLine, TapeMetadataLine, JsonValue, JsonObject } from "@agenttape/core";

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asObj(v: JsonValue | undefined | null): JsonObject | null {
  if (v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v)) {
    return v as JsonObject;
  }
  return null;
}

function asStr(v: JsonValue | undefined | null): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return JSON.stringify(v);
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(11, 23);
  } catch {
    return iso.slice(11, 23);
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

function chip(text: string, cls: string): string {
  return `<span class="chip ${cls}">${esc(text)}</span>`;
}

function resultBox(content: string): string {
  return `<div class="result-box">${esc(content)}</div>`;
}

// ─── per-event rendering ─────────────────────────────────────────────────────

type IconClass = "run" | "llm" | "tool" | "cmd" | "file" | "done" | "fail" | "muted";

interface EventMeta {
  icon: string;
  iconClass: IconClass;
  title: string;
  content: string;
}

function renderEventMeta(event: TapeEventLine): EventMeta {
  const p = asObj(event.payload as JsonValue);

  switch (event.eventType) {
    case "run_started": {
      const adapter = asStr(p?.adapter);
      const mode = asStr(p?.mode);
      const runName = p?.runName ? asStr(p.runName) : null;
      return {
        icon: "▶",
        iconClass: "run",
        title: "Run Started",
        content: [
          adapter ? chip(adapter + " adapter", "plain") : "",
          mode ? chip("mode: " + mode, "plain") : "",
          runName ? chip(runName, "plain") : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "llm_call_started": {
      const model = asStr(p?.model);
      const hasTools = p?.hasTools === true;
      const input = asStr(p?.input);
      const truncated = input.length > 240 ? input.slice(0, 240) + "…" : input;
      return {
        icon: "◈",
        iconClass: "llm",
        title: `LLM Call <span>— ${hasTools ? "with tools" : "no tools"}</span>`,
        content: [
          model ? chip(model, "model") : "",
          hasTools ? chip("tools enabled", "tools") : chip("no tools", "plain"),
          truncated ? resultBox(truncated) : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "llm_call_completed": {
      const toolCallCount = Number(p?.toolCallCount ?? 0);
      const outputText = asStr(p?.outputText);
      const toolCallsRaw = p?.toolCalls;
      const toolCalls = Array.isArray(toolCallsRaw) ? toolCallsRaw : [];

      const toolChips = toolCalls
        .slice(0, 4)
        .map((tc) => {
          const t = asObj(tc as JsonValue);
          if (!t) return "";
          const name = asStr(t.name);
          const args = asObj(t.arguments as JsonValue);
          const firstVal = args ? Object.values(args)[0] : null;
          const hint = firstVal !== undefined ? ` → ${String(firstVal).slice(0, 24)}` : "";
          return chip(name + hint, "tools");
        })
        .filter(Boolean)
        .join("");

      const title =
        toolCallCount > 0
          ? `LLM Responded <span>— triggered ${toolCallCount} tool call${toolCallCount > 1 ? "s" : ""}</span>`
          : `LLM Responded <span>— final answer generated</span>`;

      const preview =
        outputText && toolCallCount === 0
          ? resultBox(outputText.length > 320 ? outputText.slice(0, 320) + "…" : outputText)
          : "";

      return {
        icon: "◈",
        iconClass: "llm",
        title,
        content: toolChips + preview,
      };
    }

    case "tool_call_started": {
      const toolName = asStr(p?.tool);
      const callId = asStr(p?.call_id);
      const args = asObj(p?.args as JsonValue);
      const argsStr = args ? JSON.stringify(args, null, 2) : "";
      return {
        icon: "⚙",
        iconClass: "tool",
        title: `Tool Call <span>— ${esc(toolName)}</span>`,
        content: [
          callId ? chip("call_id: " + callId, "plain") : "",
          argsStr ? resultBox(argsStr.length > 320 ? argsStr.slice(0, 320) + "…" : argsStr) : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "tool_call_completed": {
      const toolName = asStr(p?.tool);
      const callId = asStr(p?.call_id);
      const ok = p?.ok !== false;
      const resultRaw = p?.result;
      const resultStr =
        resultRaw !== null && resultRaw !== undefined
          ? typeof resultRaw === "string"
            ? resultRaw
            : JSON.stringify(resultRaw)
          : "";
      return {
        icon: "⚙",
        iconClass: "tool",
        title: `Tool Result <span>— ${esc(toolName)}</span>`,
        content: [
          callId ? chip("call_id: " + callId, "plain") : "",
          ok ? chip("✓ ok", "ok") : chip("✗ error", "err"),
          resultStr ? resultBox(resultStr.length > 320 ? resultStr.slice(0, 320) + "…" : resultStr) : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "command_executed": {
      const command = asStr(p?.command);
      const exitCode = p?.exitCode;
      const success = exitCode === 0 || exitCode === null || exitCode === undefined;
      return {
        icon: "⌨",
        iconClass: "cmd",
        title: "Command Executed",
        content: [
          exitCode !== undefined ? chip("exit " + String(exitCode), success ? "ok" : "err") : "",
          command ? resultBox(command.length > 200 ? command.slice(0, 200) + "…" : command) : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "file_written":
    case "write_file": {
      const filePath = asStr(p?.path);
      const bytes = p?.bytes;
      return {
        icon: "✎",
        iconClass: "file",
        title: "File Written",
        content: [
          filePath ? chip(filePath, "plain") : "",
          bytes !== undefined ? chip(String(bytes) + " bytes", "ok") : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "read_file": {
      const filePath = asStr(p?.path);
      return {
        icon: "◎",
        iconClass: "muted",
        title: "File Read",
        content: filePath ? chip(filePath, "plain") : "",
      };
    }

    case "run_command": {
      const command = asStr(p?.command);
      const phase = asStr(p?.phase);
      const exitCode = p?.exitCode;
      return {
        icon: "⌨",
        iconClass: "cmd",
        title: `Session Command <span>— ${esc(phase)}</span>`,
        content: [
          command ? chip(command, "plain") : "",
          exitCode !== undefined ? chip("exit " + String(exitCode), exitCode === 0 ? "ok" : "err") : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "git_commit": {
      const before = asStr(p?.before).slice(0, 7);
      const after = asStr(p?.after).slice(0, 7);
      return {
        icon: "⑂",
        iconClass: "run",
        title: "Git Commit",
        content: [
          before ? chip(before + " →", "plain") : "",
          after ? chip(after, "ok") : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "search_repo": {
      const query = asStr(p?.query);
      return {
        icon: "⌕",
        iconClass: "muted",
        title: "Repo Search",
        content: query ? chip(query, "plain") : "",
      };
    }

    case "run_completed": {
      const toolCallCount = p?.toolCallCount;
      return {
        icon: "★",
        iconClass: "done",
        title: "Run Completed",
        content: [
          toolCallCount !== undefined ? chip(String(toolCallCount) + " tool calls", "ok") : "",
          chip("success", "ok"),
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    case "run_failed": {
      const exitCode = p?.exitCode;
      const error = asStr(p?.error ?? p?.reason ?? null);
      return {
        icon: "✕",
        iconClass: "fail",
        title: "Run Failed",
        content: [
          exitCode !== undefined ? chip("exit " + String(exitCode), "err") : "",
          error ? chip(error.slice(0, 60), "err") : "",
        ]
          .filter(Boolean)
          .join(""),
      };
    }

    default: {
      return {
        icon: "·",
        iconClass: "muted",
        title: esc(event.eventType),
        content: "",
      };
    }
  }
}

function renderEvent(event: TapeEventLine): string {
  const meta = renderEventMeta(event);
  const time = formatTimestamp(event.timestamp);
  return `
    <div class="event">
      <div class="event-icon ${meta.iconClass}">${meta.icon}</div>
      <div class="event-body">
        <div class="event-top">
          <div class="event-title">${meta.title}</div>
          <div class="event-seq">#${event.sequence} · ${esc(time)}</div>
        </div>
        ${meta.content ? `<div class="event-content">${meta.content}</div>` : ""}
      </div>
    </div>`;
}

// ─── main export ─────────────────────────────────────────────────────────────

export function generateTapeHtml(tape: { metadata: TapeMetadataLine; events: TapeEventLine[] }): string {
  const { metadata, events } = tape;

  const llmCallCount = events.filter((e) => e.eventType === "llm_call_started").length;
  const toolCallCount = events.filter((e) => e.eventType === "tool_call_started").length;
  const isFailed = events.some((e) => e.eventType === "run_failed");
  const isCompleted = events.some((e) => e.eventType === "run_completed");

  const firstLlm = events.find((e) => e.eventType === "llm_call_started");
  const model = firstLlm ? asStr(asObj(firstLlm.payload as JsonValue)?.model) : "";

  // Extract final answer from run_completed payload
  const terminalEvent = [...events].reverse().find((e) => e.eventType === "run_completed" || e.eventType === "run_failed");
  const terminalPayload = terminalEvent ? asObj(terminalEvent.payload as JsonValue) : null;
  const finalAnswer =
    terminalPayload
      ? asStr(terminalPayload.answer ?? terminalPayload.output ?? null) || null
      : null;

  const statusLabel = isFailed ? "Run Failed" : isCompleted ? "Run Completed" : "In Progress";
  const statusClass = isFailed ? "fail" : isCompleted ? "success" : "progress";
  const agentLabel = metadata.agent ?? "(no agent)";

  const timelineHtml = events.map((e) => renderEvent(e)).join("\n");

  const finalAnswerSection = finalAnswer
    ? `
  <div class="answer-card">
    <div class="answer-label">⬡ Final Answer</div>
    <div class="answer-text">${esc(finalAnswer)}</div>
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AgentTape — ${esc(metadata.runId)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

  :root {
    --bg: #0d0f12;
    --surface: #141720;
    --border: #1e2330;
    --accent: #4ade80;
    --accent-dim: rgba(74,222,128,0.12);
    --yellow: #fbbf24;
    --yellow-dim: rgba(251,191,36,0.12);
    --blue: #60a5fa;
    --blue-dim: rgba(96,165,250,0.12);
    --red: #f87171;
    --red-dim: rgba(248,113,113,0.12);
    --purple: #a78bfa;
    --purple-dim: rgba(167,139,250,0.12);
    --orange: #fb923c;
    --orange-dim: rgba(251,146,60,0.12);
    --muted: #4b5563;
    --text: #e2e8f0;
    --text-dim: #64748b;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    min-height: 100vh;
    padding: 32px 24px;
  }

  .page { max-width: 860px; margin: 0 auto; }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 4px;
    margin-bottom: 12px;
  }
  .badge.success { background: var(--accent-dim); color: var(--accent); border: 1px solid rgba(74,222,128,0.25); }
  .badge.fail    { background: var(--red-dim);    color: var(--red);    border: 1px solid rgba(248,113,113,0.25); }
  .badge.progress { background: var(--yellow-dim); color: var(--yellow); border: 1px solid rgba(251,191,36,0.25); }
  .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  h1 { font-size: 22px; font-weight: 600; color: var(--text); margin-bottom: 6px; }

  .run-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.9;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }

  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .stat-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 6px;
  }
  .stat-value {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }
  .stat-value.model-val { font-size: 13px; padding-top: 3px; }
  .stat-value.green  { color: var(--accent); }
  .stat-value.blue   { color: var(--blue); }
  .stat-value.yellow { color: var(--yellow); }
  .stat-value.red    { color: var(--red); }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 14px;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 19px;
    top: 20px;
    bottom: 20px;
    width: 1px;
    background: var(--border);
    z-index: 0;
  }

  .event {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 4px 0;
    position: relative;
    z-index: 1;
  }

  .event-icon {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 15px;
    border: 2px solid var(--bg);
  }
  .event-icon.run   { background: var(--accent-dim); color: var(--accent); }
  .event-icon.llm   { background: var(--blue-dim);   color: var(--blue); }
  .event-icon.tool  { background: var(--yellow-dim); color: var(--yellow); }
  .event-icon.done  { background: var(--purple-dim); color: var(--purple); }
  .event-icon.fail  { background: var(--red-dim);    color: var(--red); }
  .event-icon.cmd   { background: var(--orange-dim); color: var(--orange); }
  .event-icon.file  { background: var(--purple-dim); color: var(--purple); }
  .event-icon.muted { background: rgba(255,255,255,0.04); color: var(--text-dim); }

  .event-body {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 8px;
    transition: border-color 0.15s;
  }
  .event-body:hover { border-color: #2e3548; }

  .event-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .event-title { font-weight: 600; font-size: 13px; color: var(--text); }
  .event-title span { color: var(--text-dim); font-weight: 400; }

  .event-seq {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
    background: var(--bg);
    padding: 2px 7px;
    border-radius: 4px;
    white-space: nowrap;
    margin-left: 8px;
  }

  .event-content {
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.6;
    margin-top: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 5px;
    margin-right: 6px;
    margin-top: 2px;
  }
  .chip.model { background: var(--blue-dim);   color: var(--blue); }
  .chip.tools { background: var(--yellow-dim); color: var(--yellow); }
  .chip.ok    { background: var(--accent-dim); color: var(--accent); }
  .chip.err   { background: var(--red-dim);    color: var(--red); }
  .chip.plain { background: rgba(255,255,255,0.05); color: var(--text-dim); }

  .result-box {
    margin-top: 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 10px 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--text);
    line-height: 1.65;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .answer-card {
    margin-top: 24px;
    background: var(--surface);
    border: 1px solid rgba(74,222,128,0.3);
    border-radius: 12px;
    padding: 20px 22px;
  }
  .answer-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 10px;
  }
  .answer-text {
    font-size: 14px;
    color: var(--text);
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .watermark {
    margin-top: 48px;
    text-align: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.06em;
  }
  .watermark a { color: var(--muted); text-decoration: none; }
  .watermark a:hover { color: var(--text-dim); }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <div class="badge ${statusClass}"><span class="dot"></span> ${esc(statusLabel)}</div>
      <h1>AgentTape Run Viewer</h1>
      <div class="run-meta">
        Run ID &nbsp;&nbsp;${esc(metadata.runId)}<br>
        Started &nbsp;${esc(formatDate(metadata.createdAt))} · ${esc(formatTimestamp(metadata.createdAt))} UTC<br>
        Agent &nbsp;&nbsp;&nbsp;${esc(agentLabel)}
      </div>
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Model</div>
      <div class="stat-value model-val">${esc(model || "—")}</div>
    </div>
    <div class="stat">
      <div class="stat-label">LLM Calls</div>
      <div class="stat-value blue">${llmCallCount}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Tool Calls</div>
      <div class="stat-value yellow">${toolCallCount}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Status</div>
      <div class="stat-value ${isFailed ? "red" : "green"}">${isFailed ? "✗ failed" : isCompleted ? "✓ ok" : "… running"}</div>
    </div>
  </div>

  <div class="section-label">Event Timeline</div>
  <div class="timeline">
    ${timelineHtml}
  </div>
  ${finalAnswerSection}

  <div class="watermark">
    generated by <a href="https://github.com/Ishan-sa/agent-tape" target="_blank">agenttape</a>
  </div>

</div>
</body>
</html>`;
}
