import { exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { readTape } from "@agenttape/core";

import { generateTapeHtml } from "../html-export/generate.js";

export interface UiOptions {
  out?: string;
  open: boolean;
}

function openInBrowser(filePath: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${filePath}"`
      : process.platform === "win32"
        ? `start "" "${filePath}"`
        : `xdg-open "${filePath}"`;

  exec(cmd, (err) => {
    if (err) {
      console.error(`  warning: could not open browser — ${err.message}`);
    }
  });
}

export async function runUi(tapePath: string, options: UiOptions): Promise<number> {
  const absPath = resolve(tapePath);

  let tape: Awaited<ReturnType<typeof readTape>>;
  try {
    tape = await readTape(absPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error reading tape: ${message}`);
    return 1;
  }

  const html = generateTapeHtml(tape);

  const outPath = options.out
    ? resolve(options.out)
    : join(dirname(absPath), basename(absPath, ".jsonl") + ".html");

  await writeFile(outPath, html, "utf8");

  console.log(`tape:    ${absPath}`);
  console.log(`viewer:  ${outPath}`);
  console.log(`events:  ${tape.events.length}`);

  if (options.open) {
    openInBrowser(outPath);
  }

  return 0;
}
