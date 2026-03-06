import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { resolveRedactionProfile, type RedactProfile } from "@agenttape/adapter-openai";
import {
  generateRunId,
  readTapeEvents,
  TapeWriter,
  type TapeEventLine,
  type TapeEventType,
} from "@agenttape/core";

export interface RecordOptions {
  agent: string;
  out: string;
  adapter: "openai";
  redact: RedactProfile;
  name?: string;
  metadata: string[];
  quiet: boolean;
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

async function spawnAgent(command: string, quiet: boolean, env: NodeJS.ProcessEnv): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const child = spawn(command, {
    shell: true,
    stdio: quiet ? "pipe" : "inherit",
    env,
  });

  if (quiet) {
    child.stdout?.on("data", () => {
      return;
    });
    child.stderr?.on("data", () => {
      return;
    });
  }

  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolvePromise({ code, signal });
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
  if (options.adapter !== "openai") {
    throw new Error(`Unsupported adapter: ${options.adapter}`);
  }

  const metadata = parseMetadata(options.metadata);
  const runId = generateRunId();
  const datePrefix = formatDatePrefix(new Date());
  const outDir = resolve(options.out);
  const tapeDir = join(outDir, datePrefix);
  const tapePath = join(tapeDir, `${runId}.jsonl`);
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
      adapter: options.adapter,
      runName: options.name ?? null,
      command: options.agent,
      cwd: process.cwd(),
      metadata,
    },
  });
  await writer.close();

  const childResult = await spawnAgent(options.agent, options.quiet, {
    ...process.env,
    AGENTTAPE_RUN_ID: runId,
    AGENTTAPE_TAPE_PATH: tapePath,
    AGENTTAPE_ADAPTER: options.adapter,
    AGENTTAPE_REDACT_PROFILE: options.redact,
    AGENTTAPE_RUN_NAME: options.name ?? "",
    AGENTTAPE_METADATA_JSON: JSON.stringify(metadata),
  });

  const code = normalizeExitCode(childResult.code);

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

  return code;
}
