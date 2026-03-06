import { resolve } from "node:path";

import { loadReplayTape, ReplaySession, type ReplayMode } from "@agenttape/replay-engine";

let replaySessionPromise: Promise<ReplaySession | undefined> | undefined;
let replayModeCache: ReplayMode | undefined;

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function parseMode(value: string | undefined): ReplayMode {
  if (value === "full" || value === "tools-only" || value === "llm-only" || value === "hybrid") {
    return value;
  }
  return "full";
}

export function isReplayEnabled(): boolean {
  return envValue("AGENTTAPE_REPLAY") === "1";
}

export function getReplayMode(): ReplayMode {
  if (!replayModeCache) {
    replayModeCache = parseMode(envValue("AGENTTAPE_REPLAY_MODE"));
  }
  return replayModeCache;
}

export async function getReplaySessionFromEnv(): Promise<ReplaySession | undefined> {
  if (!isReplayEnabled()) {
    return undefined;
  }

  if (!replaySessionPromise) {
    replaySessionPromise = (async () => {
      const tapePath = envValue("AGENTTAPE_REPLAY_TAPE_PATH");
      if (!tapePath) {
        throw new Error("Replay mode enabled but AGENTTAPE_REPLAY_TAPE_PATH is missing");
      }

      const loaded = await loadReplayTape(resolve(tapePath));
      return new ReplaySession(loaded);
    })();
  }

  return replaySessionPromise;
}
