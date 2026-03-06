import { TapeWriter, type JsonValue, type TapeEventType } from "@agenttape/core";

export interface ClaudeEventPayload {
  eventType: TapeEventType;
  payload: JsonValue;
}

export async function appendClaudeEvent(tapePath: string, event: ClaudeEventPayload): Promise<void> {
  const writer = await TapeWriter.openForAppend(tapePath);
  await writer.writeEvent({
    eventType: event.eventType,
    payload: event.payload,
  });
  await writer.close();
}

export async function appendCommandExecutedEvent(
  tapePath: string,
  command: string,
  exitCode: number,
): Promise<void> {
  await appendClaudeEvent(tapePath, {
    eventType: "command_executed",
    payload: {
      command,
      exitCode,
    },
  });
}

export async function appendFileWrittenEvent(
  tapePath: string,
  filePath: string,
  bytes?: number,
): Promise<void> {
  await appendClaudeEvent(tapePath, {
    eventType: "file_written",
    payload: {
      path: filePath,
      ...(bytes !== undefined ? { bytes } : {}),
    },
  });
}
