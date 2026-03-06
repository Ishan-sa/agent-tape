import { resolve } from "node:path";

import { diffTapes, type DiffOptions } from "@agenttape/diff-engine";

export interface CliDiffOptions {
  summary: boolean;
  json: boolean;
  failOnChange: boolean;
  ignore: string[];
  check: string[];
}

const ALLOWED_IGNORE = new Set(["timestamps", "usage", "final_output"]);
const ALLOWED_CHECK = new Set([
  "tool-sequence",
  "tool-args",
  "tool-results",
  "llm-finish-reason",
]);

function parseDiffOptions(options: CliDiffOptions): DiffOptions {
  for (const value of options.ignore) {
    if (!ALLOWED_IGNORE.has(value)) {
      throw new Error(`Unsupported --ignore value: ${value}`);
    }
  }

  for (const value of options.check) {
    if (!ALLOWED_CHECK.has(value)) {
      throw new Error(`Unsupported --check value: ${value}`);
    }
  }

  return {
    ignoreTimestamps: true,
    ignoreUsage: true,
    ignoreFinalOutput: options.ignore.includes("final_output"),
    checkToolSequence: true,
    checkToolArgs: true,
    checkToolResults: true,
    checkLlmFinishReason: options.check.includes("llm-finish-reason"),
  };
}

export async function runDiff(
  baselineTapePath: string,
  currentTapePath: string,
  options: CliDiffOptions,
): Promise<number> {
  const report = await diffTapes(
    resolve(baselineTapePath),
    resolve(currentTapePath),
    parseDiffOptions(options),
  );

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.summary);
    if (report.differences.length > 0) {
      console.log("\nDifferences:");
      for (const diff of report.differences) {
        console.log(`- [${diff.severity}] ${diff.message}`);
      }
    }
  }

  if (options.failOnChange && report.severity !== "none") {
    return 1;
  }

  return 0;
}
