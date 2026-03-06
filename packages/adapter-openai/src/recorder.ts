import { TapeWriter, type JsonValue, type TapeEventType } from "@agenttape/core";

import { getReplaySessionFromEnv, isReplayEnabled } from "./replay-runtime.js";
import { resolveRedactionProfile } from "./redaction-profiles.js";
import type { RedactProfile } from "./types.js";

export interface RunRecorder {
  readonly enabled: boolean;
  readonly runId?: string;
  readonly tapePath?: string;
  readonly replayEnabled?: boolean;
  record(eventType: TapeEventType, payload: JsonValue): Promise<void>;
  close(): Promise<void>;
}

class NoopRecorder implements RunRecorder {
  readonly enabled = false;

  async record(_eventType: TapeEventType, _payload: JsonValue): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    return;
  }
}

class TapeRunRecorder implements RunRecorder {
  readonly enabled = true;

  constructor(
    private readonly writer: TapeWriter,
    readonly runId: string,
    readonly tapePath: string,
  ) {}

  async record(eventType: TapeEventType, payload: JsonValue): Promise<void> {
    await this.writer.writeEvent({ eventType, payload });
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}

class ReplayRunRecorder implements RunRecorder {
  readonly enabled = true;
  readonly replayEnabled = true;

  async record(eventType: TapeEventType, _payload: JsonValue): Promise<void> {
    const session = await getReplaySessionFromEnv();
    if (!session) {
      throw new Error("Replay recorder was enabled but no replay session is available");
    }

    session.recordRuntimeEvent(eventType);
  }

  async close(): Promise<void> {
    const session = await getReplaySessionFromEnv();
    if (!session) {
      return;
    }

    session.finalize();
  }
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

export async function createRunRecorderFromEnv(): Promise<RunRecorder> {
  if (isReplayEnabled()) {
    await getReplaySessionFromEnv();
    return new ReplayRunRecorder();
  }

  const tapePath = envValue("AGENTTAPE_TAPE_PATH");
  const runId = envValue("AGENTTAPE_RUN_ID");

  if (!tapePath || !runId) {
    return new NoopRecorder();
  }

  const profile = (envValue("AGENTTAPE_REDACT_PROFILE") ?? "default") as RedactProfile;
  const redaction = resolveRedactionProfile(profile);

  const writer = await TapeWriter.openForAppend(tapePath, {
    ...(redaction ? { redaction } : {}),
  });

  return new TapeRunRecorder(writer, runId, tapePath);
}
