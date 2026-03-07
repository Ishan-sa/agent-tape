import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { readTape, type TapeEventLine, type JsonObject, type JsonValue } from "@agenttape/core";
import {
  evaluateInvariants,
  loadReplayTape,
  type ReplayMode,
  type ReplaySummary,
} from "@agenttape/replay-engine";

export interface ReplayOptions {
  tapePath: string;
  offline: boolean;
  mode: ReplayMode;
  liveTool: string[];
  assertInvariants: boolean;
  output: "summary" | "json";
  failOnMismatch: boolean;
  verifyFiles: boolean;
}

// ─── agent-style replay (original behaviour) ─────────────────────────────────

async function spawnReplayAgent(command: string, env: NodeJS.ProcessEnv): Promise<number> {
  const child = spawn(command, { shell: true, stdio: "inherit", env });
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

function printSummary(summary: ReplaySummary): void {
  console.log(`Tape: ${summary.tapePath}`);
  console.log(`Mode: ${summary.mode}`);
  console.log(`Status: ${summary.status}`);
  console.log(`Replayed LLM calls: ${summary.replayedLlmCalls}`);
  console.log(`Replayed tool calls: ${summary.replayedToolCalls}`);
  console.log(`Duration: ${summary.durationMs}ms`);
  console.log(`Mismatches: ${summary.mismatches}`);
}

// ─── session tape walkthrough ─────────────────────────────────────────────────

function asObj(p: JsonValue): JsonObject | null {
  if (p !== null && typeof p === "object" && !Array.isArray(p)) return p as JsonObject;
  return null;
}

function str(v: JsonValue | undefined): string {
  return typeof v === "string" ? v : String(v ?? "");
}

interface SessionSummary {
  tapePath: string;
  runId: string;
  agent: string;
  status: "success" | "failed" | "incomplete";
  filesRead: string[];
  filesWritten: string[];
  commands: Array<{ command: string; exitCode: number | null }>;
  gitCommits: Array<{ before: string; after: string }>;
  eventCount: number;
  invariantsPassed: boolean;
  missingFiles: string[];
}

async function sessionWalkthrough(
  tapePath: string,
  verifyFiles: boolean,
  assertInvariants: boolean,
): Promise<{ summary: SessionSummary; exitCode: number }> {
  const tape = await readTape(tapePath);
  const events = tape.events;

  const filesRead: string[] = [];
  const filesWritten: string[] = [];
  const commands: Array<{ command: string; exitCode: number | null }> = [];
  const gitCommits: Array<{ before: string; after: string }> = [];

  let status: "success" | "failed" | "incomplete" = "incomplete";

  for (const event of events) {
    const p = asObj(event.payload as JsonValue);

    switch (event.eventType) {
      case "read_file": {
        const path = str(p?.path);
        if (path) filesRead.push(path);
        break;
      }
      case "file_written":
      case "write_file": {
        const path = str(p?.path);
        if (path) filesWritten.push(path);
        break;
      }
      case "command_executed": {
        const command = str(p?.command);
        const exitCode = typeof p?.exitCode === "number" ? p.exitCode : null;
        if (command) commands.push({ command, exitCode });
        break;
      }
      case "run_command": {
        // Only record completed phase to avoid duplicates
        if (p?.phase === "completed") {
          const command = str(p.command);
          const exitCode = typeof p.exitCode === "number" ? p.exitCode : null;
          if (command) commands.push({ command, exitCode });
        }
        break;
      }
      case "git_commit": {
        const before = str(p?.before).slice(0, 7);
        const after = str(p?.after).slice(0, 7);
        gitCommits.push({ before, after });
        break;
      }
      case "run_completed":
        status = "success";
        break;
      case "run_failed":
        status = "failed";
        break;
    }
  }

  // Invariant check
  const invariantResults = evaluateInvariants(events);
  const invariantsPassed = invariantResults.every((r) => r.ok);

  if (assertInvariants) {
    console.log("\nInvariant results:");
    for (const r of invariantResults) {
      console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}: ${r.details}`);
    }
  }

  // Verify files still exist on disk
  const missingFiles: string[] = [];
  if (verifyFiles && filesWritten.length > 0) {
    const uniqueWritten = [...new Set(filesWritten)];
    for (const filePath of uniqueWritten) {
      try {
        await stat(filePath);
      } catch {
        missingFiles.push(filePath);
      }
    }
  }

  const summary: SessionSummary = {
    tapePath,
    runId: tape.metadata.runId,
    agent: tape.metadata.agent ?? "(unknown)",
    status,
    filesRead: [...new Set(filesRead)],
    filesWritten: [...new Set(filesWritten)],
    commands,
    gitCommits,
    eventCount: events.length,
    invariantsPassed,
    missingFiles,
  };

  const exitCode = status === "success" && invariantsPassed && missingFiles.length === 0 ? 0 : 1;

  return { summary, exitCode };
}

function printSessionSummary(s: SessionSummary): void {
  const statusIcon = s.status === "success" ? "✓" : s.status === "failed" ? "✗" : "?";

  console.log(`Tape:        ${s.tapePath}`);
  console.log(`Mode:        session`);
  console.log(`Status:      ${statusIcon} ${s.status}`);
  console.log(`Events:      ${s.eventCount}`);

  if (s.filesWritten.length > 0) {
    console.log(`\nFiles written (${s.filesWritten.length}):`);
    for (const f of s.filesWritten) {
      const missing = s.missingFiles.includes(f);
      console.log(`  ${missing ? "✗ missing" : "✓"} ${f}`);
    }
  }

  if (s.filesRead.length > 0) {
    console.log(`\nFiles read (${s.filesRead.length}):`);
    for (const f of s.filesRead) {
      console.log(`  ${f}`);
    }
  }

  if (s.commands.length > 0) {
    console.log(`\nCommands (${s.commands.length}):`);
    for (const c of s.commands) {
      const code = c.exitCode !== null ? ` [exit ${c.exitCode}]` : "";
      console.log(`  $ ${c.command}${code}`);
    }
  }

  if (s.gitCommits.length > 0) {
    console.log(`\nGit commits (${s.gitCommits.length}):`);
    for (const g of s.gitCommits) {
      console.log(`  ${g.before} → ${g.after}`);
    }
  }

  if (!s.invariantsPassed) {
    console.log(`\nInvariants: FAILED`);
  }

  if (s.missingFiles.length > 0) {
    console.log(`\nMissing files (${s.missingFiles.length}):`);
    for (const f of s.missingFiles) {
      console.log(`  ✗ ${f}`);
    }
  }
}

// ─── entry point ─────────────────────────────────────────────────────────────

export async function runReplay(options: ReplayOptions): Promise<number> {
  if (options.mode !== "full") {
    throw new Error(`Replay mode "${options.mode}" is not implemented yet. Use: full`);
  }

  const tapePath = resolve(options.tapePath);
  const loaded = await loadReplayTape(tapePath);

  // Detect tape type: session tapes have no LLM call events
  const isSessionTape = loaded.expectedLlmCalls === 0;

  if (isSessionTape) {
    // ── Claude Code session tape: walkthrough mode ──
    const { summary, exitCode } = await sessionWalkthrough(
      tapePath,
      options.verifyFiles,
      options.assertInvariants,
    );

    if (options.output === "json") {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printSessionSummary(summary);
    }

    if (exitCode !== 0 && options.failOnMismatch) return exitCode;
    return 0;
  }

  // ── Agent tape: original spawn-and-intercept mode ──
  if (options.assertInvariants) {
    const invariants = evaluateInvariants(loaded.events);
    console.log("Invariant results:");
    for (const invariant of invariants) {
      console.log(`  ${invariant.ok ? "✓" : "✗"} ${invariant.name}: ${invariant.details}`);
    }
    const failed = invariants.filter((r) => !r.ok);
    if (failed.length > 0) {
      throw new Error(`Invariant assertion failed with ${failed.length} violations`);
    }
  }

  const startedAt = Date.now();
  const exitCode = await spawnReplayAgent(loaded.command, {
    ...process.env,
    AGENTTAPE_REPLAY: "1",
    AGENTTAPE_REPLAY_TAPE_PATH: tapePath,
    AGENTTAPE_REPLAY_MODE: options.mode,
    AGENTTAPE_REPLAY_OFFLINE: options.offline ? "1" : "0",
    AGENTTAPE_REPLAY_LIVE_TOOLS: JSON.stringify(options.liveTool),
    AGENTTAPE_REPLAY_FAIL_ON_MISMATCH: options.failOnMismatch ? "1" : "0",
  });
  const durationMs = Date.now() - startedAt;

  const summary: ReplaySummary = {
    tapePath,
    mode: options.mode,
    status: exitCode === 0 ? "success" : "failed",
    replayedLlmCalls: loaded.expectedLlmCalls,
    replayedToolCalls: loaded.expectedToolCalls,
    durationMs,
    mismatches: exitCode === 0 ? 0 : 1,
  };

  if (options.output === "json") {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSummary(summary);
  }

  if (exitCode !== 0 && options.failOnMismatch) return exitCode;
  return 0;
}
