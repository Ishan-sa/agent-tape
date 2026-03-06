import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { diffTapes, type DiffOptions } from "@agenttape/diff-engine";
import { generateRunId, readTape, readTapeEvents, TapeWriter } from "@agenttape/core";

import { loadAgentTapeConfig } from "./config.js";
import type {
  AgentTestResult,
  AgentTestRunOptions,
  AgentTestRunSummary,
  AgentTapeConfig,
} from "./types.js";

function parseCommandFromTape(tapeEvents: Awaited<ReturnType<typeof readTape>>["events"]): string {
  const first = tapeEvents[0];
  if (!first || first.eventType !== "run_started") {
    throw new Error("Test tape must start with run_started event");
  }

  if (typeof first.payload !== "object" || first.payload === null || Array.isArray(first.payload)) {
    throw new Error("run_started payload must be an object");
  }

  const command = (first.payload as Record<string, unknown>).command;
  if (typeof command !== "string" || command.length === 0) {
    throw new Error("run_started payload missing command");
  }

  return command;
}

async function spawnCommand(command: string, env: NodeJS.ProcessEnv): Promise<number> {
  const child = spawn(command, {
    shell: true,
    stdio: "pipe",
    env,
  });

  child.stdout?.on("data", () => {
    return;
  });
  child.stderr?.on("data", () => {
    return;
  });

  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      resolvePromise(code ?? 1);
    });
  });
}

async function ensureTerminalEvent(tapePath: string, exitCode: number): Promise<void> {
  const events = await readTapeEvents(tapePath);
  const hasTerminal = events.some(
    (event) => event.eventType === "run_completed" || event.eventType === "run_failed",
  );

  if (hasTerminal) {
    return;
  }

  const writer = await TapeWriter.openForAppend(tapePath);
  await writer.writeEvent({
    eventType: exitCode === 0 ? "run_completed" : "run_failed",
    payload: {
      source: "agenttape-test-runner",
      exitCode,
    },
  });
  await writer.close();
}

async function recordCurrentRun(command: string, outDir: string): Promise<{ tapePath: string; exitCode: number }> {
  const runId = generateRunId("test");
  const tapePath = join(outDir, `${runId}.jsonl`);

  await mkdir(outDir, { recursive: true });

  const writer = await TapeWriter.create(tapePath, {
    runId,
    agent: command,
    source: "agenttape.test",
  });

  await writer.writeEvent({
    eventType: "run_started",
    payload: {
      command,
      source: "agenttape.test",
    },
  });
  await writer.close();

  const exitCode = await spawnCommand(command, {
    ...process.env,
    AGENTTAPE_RUN_ID: runId,
    AGENTTAPE_TAPE_PATH: tapePath,
    AGENTTAPE_ADAPTER: "openai",
    AGENTTAPE_REDACT_PROFILE: "default",
  });

  await ensureTerminalEvent(tapePath, exitCode);

  return { tapePath, exitCode };
}

function toDiffOptions(config: AgentTapeConfig): DiffOptions {
  return {
    ignoreTimestamps: config.ignoreFields.includes("timestamp"),
    ignoreUsage: config.ignoreFields.includes("token_usage"),
    ignoreFinalOutput: config.ignoreFields.includes("final_output"),
    checkToolSequence: true,
    checkToolArgs: true,
    checkToolResults: true,
    checkLlmFinishReason: false,
  };
}

function shouldFailSeverity(severity: AgentTestResult["severity"], failOnMinor: boolean): boolean {
  if (severity === "none") {
    return false;
  }
  if (severity === "minor") {
    return failOnMinor;
  }
  return true;
}

function formatReason(kind: string, baseline: unknown, current: unknown): string {
  const base = typeof baseline === "string" ? baseline : JSON.stringify(baseline);
  const curr = typeof current === "string" ? current : JSON.stringify(current);
  return `${kind}\nbaseline: ${base}\ncurrent: ${curr}`;
}

async function runReplayCheck(baselineTapePath: string, command: string): Promise<void> {
  const exitCode = await spawnCommand(command, {
    ...process.env,
    AGENTTAPE_REPLAY: "1",
    AGENTTAPE_REPLAY_TAPE_PATH: baselineTapePath,
    AGENTTAPE_REPLAY_MODE: "full",
    AGENTTAPE_REPLAY_OFFLINE: "1",
    AGENTTAPE_REPLAY_FAIL_ON_MISMATCH: "1",
  });

  if (exitCode !== 0) {
    throw new Error("Replay check failed for baseline tape");
  }
}

export async function runAgentTests(options: AgentTestRunOptions): Promise<AgentTestRunSummary> {
  const config = await loadAgentTapeConfig();
  const testsDir = resolve(config.testsDir);
  const entries = await readdir(testsDir, { withFileTypes: true });
  const tapeFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(testsDir, entry.name))
    .sort();

  const results: AgentTestResult[] = [];

  for (const baselineTapePath of tapeFiles) {
    const name = basename(baselineTapePath).replace(/\.tape\.jsonl$|\.jsonl$/g, "");

    try {
      const baselineTape = await readTape(baselineTapePath);
      const command = parseCommandFromTape(baselineTape.events);

      await runReplayCheck(baselineTapePath, command);

      const outDir = resolve(".tmp", "agent-tests", name);
      const currentRun = await recordCurrentRun(command, outDir);

      const report = await diffTapes(baselineTapePath, currentRun.tapePath, toDiffOptions(config));

      if (options.updateBaseline && report.severity !== "none") {
        await copyFile(currentRun.tapePath, baselineTapePath);
        results.push({
          name,
          baselineTapePath,
          currentTapePath: currentRun.tapePath,
          pass: true,
          severity: "none",
          reason: "baseline updated",
        });
        continue;
      }

      const failed = shouldFailSeverity(report.severity, config.failOnMinor);
      const first = report.differences[0];

      results.push({
        name,
        baselineTapePath,
        currentTapePath: currentRun.tapePath,
        pass: !failed,
        severity: report.severity,
        ...(first
          ? {
              reason: formatReason(first.message, first.baseline ?? null, first.current ?? null),
            }
          : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name,
        baselineTapePath,
        pass: false,
        severity: "breaking",
        reason: message,
      });
    }
  }

  const failed = results.filter((result) => !result.pass).length;

  return {
    total: results.length,
    passed: results.length - failed,
    failed,
    results,
  };
}
