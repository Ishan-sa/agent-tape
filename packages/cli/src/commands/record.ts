import { exec, spawn } from "node:child_process";
import { appendFile, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  generateRunId,
  readTape,
  readTapeEvents,
  resolveRedactionProfile,
  TapeWriter,
  type RedactProfile,
  type TapeEventLine,
  type TapeEventType,
} from "@agenttape/core";

import { generateTapeHtml } from "../html-export/generate.js";

export interface RecordOptions {
  agent: string;
  out: string;
  redact: RedactProfile;
  session: boolean;
  name?: string;
  metadata: string[];
  quiet: boolean;
}

async function ensureGitignore(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, ".gitignore");
  const entry = "agenttape/";
  try {
    const content = await readFile(gitignorePath, "utf8");
    if (content.split("\n").some((l) => l.trim() === entry)) return;
    await appendFile(gitignorePath, (content.endsWith("\n") ? "" : "\n") + entry + "\n");
  } catch {
    await writeFile(gitignorePath, entry + "\n");
  }
}

function openInBrowser(filePath: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${filePath}"`
      : process.platform === "win32"
        ? `start "" "${filePath}"`
        : `xdg-open "${filePath}"`;
  exec(cmd);
}

function parseMetadata(entries: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const [rawKey, ...rawValue] = entry.split("=");
    const key = rawKey?.trim();
    const value = rawValue.join("=").trim();

    if (!key) {
      throw new Error(`Invalid --metadata value: ${entry}. Expected key=value.`);
    }

    result[key] = value;
  }

  return result;
}

function formatDatePrefix(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hasTerminalEvent(events: TapeEventLine[]): boolean {
  return events.some((event) => event.eventType === "run_completed" || event.eventType === "run_failed");
}

function normalizeExitCode(code: number | null): number {
  if (code === null) {
    return 1;
  }
  return code;
}

function printEventProgress(event: TapeEventLine): void {
  const { eventType } = event;
  const p = (event.payload ?? {}) as Record<string, unknown>;
  let label = "";
  let detail = "";

  switch (eventType) {
    case "read_file":
      label = "read";
      detail = String(p["path"] ?? "");
      break;
    case "file_written":
    case "write_file":
      label = "write";
      detail = String(p["path"] ?? "");
      break;
    case "command_executed":
      label = "bash";
      detail = String(p["command"] ?? "").slice(0, 72);
      if (p["exitCode"] !== undefined) detail += `  [exit ${p["exitCode"]}]`;
      break;
    case "git_commit":
      label = "commit";
      detail = String(p["after"] ?? "").slice(0, 8);
      break;
    case "tool_call_started":
      label = "tool";
      detail = String(p["name"] ?? "");
      break;
    default:
      return;
  }

  if (!label) return;
  process.stderr.write(`  \u2192 ${label.padEnd(8)}  ${detail}\n`);
}

async function tailTapeEvents(tapePath: string, initialOffset: number): Promise<{ stop: () => void }> {
  let offset = initialOffset;
  let partial = "";

  const interval = setInterval(async () => {
    try {
      const fd = await open(tapePath, "r");
      const stat = await fd.stat();
      if (stat.size > offset) {
        const buf = Buffer.alloc(stat.size - offset);
        await fd.read(buf, 0, buf.length, offset);
        offset = stat.size;
        const text = partial + buf.toString("utf8");
        const lines = text.split("\n");
        partial = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as TapeEventLine;
            if (event.lineType === "event") printEventProgress(event);
          } catch {
            // skip malformed lines
          }
        }
      }
      await fd.close();
    } catch {
      // tape not ready yet — will retry
    }
  }, 200);

  return { stop: () => clearInterval(interval) };
}

async function spawnAgent(
  command: string,
  quiet: boolean,
  env: NodeJS.ProcessEnv,
  tapePath: string,
  initialTapeSize: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (!quiet) {
    process.stderr.write("\n  \u25CF Recording session...\n\n");
  }

  const tailer = quiet ? null : await tailTapeEvents(tapePath, initialTapeSize);

  const child = spawn(command, {
    shell: true,
    stdio: quiet ? "pipe" : "inherit",
    env,
  });

  if (quiet) {
    child.stdout?.on("data", () => { return; });
    child.stderr?.on("data", () => { return; });
  }

  return new Promise((resolvePromise, reject) => {
    child.once("error", (err) => {
      tailer?.stop();
      reject(err);
    });
    child.once("exit", (code, signal) => {
      tailer?.stop();
      resolvePromise({ code, signal });
    });
  });
}

async function readGitHead(cwd: string): Promise<string | null> {
  const child = spawn("git rev-parse HEAD", {
    cwd,
    shell: true,
    stdio: "pipe",
    env: process.env,
  });

  let stdout = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });

  return new Promise((resolvePromise) => {
    child.once("error", () => resolvePromise(null));
    child.once("exit", (code) => {
      if (code !== 0) {
        resolvePromise(null);
        return;
      }
      resolvePromise(stdout.trim() || null);
    });
  });
}

async function appendTerminalEventIfMissing(
  tapePath: string,
  fallbackType: TapeEventType,
  payload: Record<string, string | number | null>,
): Promise<TapeEventLine[]> {
  const eventsBefore = await readTapeEvents(tapePath);
  if (hasTerminalEvent(eventsBefore)) {
    return eventsBefore;
  }

  const writer = await TapeWriter.openForAppend(tapePath);
  await writer.writeEvent({
    eventType: fallbackType,
    payload,
  });
  await writer.close();

  return readTapeEvents(tapePath);
}

export async function runRecord(options: RecordOptions): Promise<number> {
  const metadata = parseMetadata(options.metadata);
  const runId = generateRunId();
  const datePrefix = formatDatePrefix(new Date());
  const outDir = resolve(options.out);
  const tapeDir = join(outDir, datePrefix);
  const tapePath = join(tapeDir, `${runId}.jsonl`);
  // HTML lives in a sibling "html" folder next to the "tapes" folder
  const htmlDir = join(dirname(outDir), "html", datePrefix);
  const htmlPath = join(htmlDir, `${runId}.html`);
  const redaction = resolveRedactionProfile(options.redact);

  await mkdir(tapeDir, { recursive: true });

  const writer = await TapeWriter.create(
    tapePath,
    {
      runId,
      agent: options.agent,
      source: "agenttape.record",
      ...(Object.keys(metadata).length > 0 ? { tags: metadata } : {}),
    },
    {
      ...(redaction ? { redaction } : {}),
    },
  );

  await writer.writeEvent({
    eventType: "run_started",
    payload: {
      mode: options.session ? "session" : "agent",
      runName: options.name ?? null,
      command: options.agent,
      cwd: process.cwd(),
      metadata,
    },
  });

  if (options.session) {
    await writer.writeEvent({
      eventType: "run_command",
      payload: {
        command: options.agent,
        phase: "started",
      },
    });
  }
  await writer.close();

  const gitHeadBefore = options.session ? await readGitHead(process.cwd()) : null;

  // Capture tape size now so the tailer only shows events written during the run
  let initialTapeSize = 0;
  try {
    const fd = await open(tapePath, "r");
    const stat = await fd.stat();
    initialTapeSize = stat.size;
    await fd.close();
  } catch {
    // tape may not be flushed yet; tailer will start from 0
  }

  const childResult = await spawnAgent(
    options.agent,
    options.quiet,
    {
      ...process.env,
      AGENTTAPE_RUN_ID: runId,
      AGENTTAPE_TAPE_PATH: tapePath,
      AGENTTAPE_REDACT_PROFILE: options.redact,
      AGENTTAPE_RUN_NAME: options.name ?? "",
      AGENTTAPE_METADATA_JSON: JSON.stringify(metadata),
      AGENTTAPE_SESSION: options.session ? "1" : "0",
    },
    tapePath,
    initialTapeSize,
  );

  const code = normalizeExitCode(childResult.code);

  if (options.session) {
    const sessionWriter = await TapeWriter.openForAppend(tapePath);
    await sessionWriter.writeEvent({
      eventType: "run_command",
      payload: {
        command: options.agent,
        phase: "completed",
        exitCode: code,
      },
    });

    const gitHeadAfter = await readGitHead(process.cwd());
    if (gitHeadBefore !== gitHeadAfter) {
      await sessionWriter.writeEvent({
        eventType: "git_commit",
        payload: {
          before: gitHeadBefore,
          after: gitHeadAfter,
        },
      });
    }
    await sessionWriter.close();
  }

  const events =
    code === 0
      ? await appendTerminalEventIfMissing(tapePath, "run_completed", {
          source: "agenttape-cli",
          exitCode: code,
          signal: childResult.signal,
        })
      : await appendTerminalEventIfMissing(tapePath, "run_failed", {
          source: "agenttape-cli",
          exitCode: code,
          signal: childResult.signal,
        });

  const finalStatus = events.some((event) => event.eventType === "run_failed") ? "failed" : "completed";

  console.log(`run_id=${runId}`);
  console.log(`tape_path=${tapePath}`);
  console.log(`event_count=${events.length}`);
  console.log(`status=${finalStatus}`);

  // Generate HTML viewer and open in browser
  try {
    const tape = await readTape(tapePath);
    const html = generateTapeHtml(tape);
    await mkdir(htmlDir, { recursive: true });
    await writeFile(htmlPath, html, "utf8");
    console.log(`html_path=${htmlPath}`);
    openInBrowser(htmlPath);
  } catch {
    // Non-fatal: viewer generation failing should not fail the record command
  }

  // Keep agenttape output out of the user's git history
  await ensureGitignore(process.cwd());

  return code;
}
