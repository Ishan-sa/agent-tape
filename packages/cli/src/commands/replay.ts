import { spawn } from "node:child_process";
import { resolve } from "node:path";

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
}

async function spawnReplayAgent(command: string, env: NodeJS.ProcessEnv): Promise<number> {
  const child = spawn(command, {
    shell: true,
    stdio: "inherit",
    env,
  });

  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      resolvePromise(code ?? 1);
    });
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

export async function runReplay(options: ReplayOptions): Promise<number> {
  if (options.mode !== "full") {
    throw new Error(
      `Replay mode ${options.mode} is not implemented yet. Implemented mode: full.`,
    );
  }

  const tapePath = resolve(options.tapePath);
  const loaded = await loadReplayTape(tapePath);

  if (options.assertInvariants) {
    const invariants = evaluateInvariants(loaded.events);
    console.log("Invariant results:");
    for (const invariant of invariants) {
      console.log(`- ${invariant.name}: ${invariant.ok ? "PASS" : "FAIL"} (${invariant.details})`);
    }

    const failed = invariants.filter((result) => !result.ok);
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

  if (exitCode !== 0 && options.failOnMismatch) {
    return exitCode;
  }

  return 0;
}
