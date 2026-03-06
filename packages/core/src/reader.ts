import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import { assertTapeLine, assertTapeMetadataLine } from "./schema.js";
import type { TapeEventLine, TapeLine, TapeMetadataLine } from "./types.js";

export async function* readTapeLines(filePath: string): AsyncGenerator<TapeLine, void, void> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  for await (const lineText of reader) {
    lineNumber += 1;

    if (lineText.trim().length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(lineText) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON at line ${lineNumber}: ${message}`);
    }

    try {
      assertTapeLine(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid tape line at ${lineNumber}: ${message}`);
    }

    yield parsed;
  }
}

export async function readTapeMetadata(filePath: string): Promise<TapeMetadataLine> {
  for await (const line of readTapeLines(filePath)) {
    assertTapeMetadataLine(line);
    return line;
  }

  throw new Error("Tape file is empty");
}

export async function readTapeEvents(filePath: string): Promise<TapeEventLine[]> {
  const events: TapeEventLine[] = [];
  let seenMeta = false;

  for await (const line of readTapeLines(filePath)) {
    if (line.lineType === "meta") {
      if (seenMeta) {
        throw new Error("Tape contains multiple metadata lines");
      }
      seenMeta = true;
      continue;
    }

    if (!seenMeta) {
      throw new Error("Tape must start with metadata line");
    }

    events.push(line);
  }

  if (!seenMeta) {
    throw new Error("Tape does not contain metadata line");
  }

  return events;
}

export async function readTape(filePath: string): Promise<{ metadata: TapeMetadataLine; events: TapeEventLine[] }> {
  let metadata: TapeMetadataLine | undefined;
  const events: TapeEventLine[] = [];

  for await (const line of readTapeLines(filePath)) {
    if (line.lineType === "meta") {
      if (metadata) {
        throw new Error("Tape contains multiple metadata lines");
      }
      metadata = line;
      continue;
    }

    if (!metadata) {
      throw new Error("Tape must start with metadata line");
    }

    events.push(line);
  }

  if (!metadata) {
    throw new Error("Tape does not contain metadata line");
  }

  return { metadata, events };
}
