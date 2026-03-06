import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { generateId } from "./id.js";
import { readTape } from "./reader.js";
import { redactValue } from "./redaction.js";
import { assertTapeMetadataLine } from "./schema.js";
import { nowIsoTimestamp, toIsoTimestamp } from "./timestamp.js";
import {
  AGENT_TAPE_FORMAT_V1,
  type TapeEventLine,
  type TapeMetadataLine,
  type TapeWriteEventInput,
  type TapeWriteOptions,
} from "./types.js";

function writeLine(stream: WriteStream, line: unknown): Promise<void> {
  const encoded = `${JSON.stringify(line)}\n`;
  return new Promise((resolve, reject) => {
    stream.write(encoded, (error: Error | null | undefined) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export class TapeWriter {
  readonly filePath: string;
  readonly metadata: TapeMetadataLine;

  private readonly stream: WriteStream;
  private nextSequence: number;
  private readonly options: TapeWriteOptions;

  private constructor(
    filePath: string,
    stream: WriteStream,
    metadata: TapeMetadataLine,
    options: TapeWriteOptions,
    nextSequence: number,
  ) {
    this.filePath = filePath;
    this.stream = stream;
    this.metadata = metadata;
    this.options = options;
    this.nextSequence = nextSequence;
  }

  static async create(
    filePath: string,
    metadata: Omit<TapeMetadataLine, "lineType" | "format" | "createdAt"> & {
      createdAt?: string;
    },
    options: TapeWriteOptions = {},
  ): Promise<TapeWriter> {
    await mkdir(dirname(filePath), { recursive: true });

    const stream = createWriteStream(filePath, {
      flags: options.overwrite ? "w" : "wx",
      encoding: "utf8",
    });

    const fullMetadata: TapeMetadataLine = {
      lineType: "meta",
      format: AGENT_TAPE_FORMAT_V1,
      runId: metadata.runId,
      createdAt: metadata.createdAt ? toIsoTimestamp(metadata.createdAt) : nowIsoTimestamp(),
      ...(metadata.agent !== undefined ? { agent: metadata.agent } : {}),
      ...(metadata.source !== undefined ? { source: metadata.source } : {}),
      ...(metadata.tags !== undefined ? { tags: metadata.tags } : {}),
    };

    assertTapeMetadataLine(fullMetadata);
    await writeLine(stream, fullMetadata);

    return new TapeWriter(filePath, stream, fullMetadata, options, 1);
  }

  static async openForAppend(
    filePath: string,
    options: Omit<TapeWriteOptions, "overwrite"> = {},
  ): Promise<TapeWriter> {
    const tape = await readTape(filePath);
    const stream = createWriteStream(filePath, {
      flags: "a",
      encoding: "utf8",
    });

    return new TapeWriter(filePath, stream, tape.metadata, options, tape.events.length + 1);
  }

  async writeEvent(input: TapeWriteEventInput): Promise<TapeEventLine> {
    let payload = input.payload;
    let redaction: TapeEventLine["redaction"];

    if (this.options.redaction) {
      const result = redactValue(payload, this.options.redaction);
      payload = result.value;
      if (result.records.length > 0) {
        redaction = {
          count: result.records.length,
          keys: [...new Set(result.records.map((record) => record.path))],
        };
      }
    }

    const line: TapeEventLine = {
      lineType: "event",
      id: input.id ?? generateId("evt"),
      runId: this.metadata.runId,
      sequence: this.nextSequence,
      timestamp: input.timestamp ? toIsoTimestamp(input.timestamp) : nowIsoTimestamp(),
      eventType: input.eventType,
      payload,
      ...(redaction ? { redaction } : {}),
    };

    await writeLine(this.stream, line);
    this.nextSequence += 1;
    return line;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.stream.end((error: Error | undefined) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
