#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";

import type { RedactProfile } from "@agenttape/adapter-openai";
import type { ReplayMode } from "@agenttape/replay-engine";

import { runDiff } from "./commands/diff.js";
import { runRecord } from "./commands/record.js";
import { runReplay } from "./commands/replay.js";

function parseMetadataOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseRedact(value: string): RedactProfile {
  if (value === "default" || value === "strict" || value === "off") {
    return value;
  }
  throw new InvalidArgumentError(`Invalid --redact value: ${value}`);
}

function parseMode(value: string): ReplayMode {
  if (value === "full" || value === "tools-only" || value === "llm-only" || value === "hybrid") {
    return value;
  }
  throw new InvalidArgumentError(`Invalid --mode value: ${value}`);
}

function parseOutput(value: string): "summary" | "json" {
  if (value === "summary" || value === "json") {
    return value;
  }
  throw new InvalidArgumentError(`Invalid --output value: ${value}`);
}

const program = new Command();

program
  .name("agenttape")
  .description("AgentTape CLI")
  .version("0.4.0");

program
  .command("record")
  .description("Record one agent run into an AgentTape JSONL tape")
  .requiredOption("--agent <command>", "Agent command to execute")
  .option("--out <dir>", "Output directory", "./tapes")
  .option("--adapter <name>", "Adapter type", "openai")
  .option("--redact <profile>", "Redaction profile: default|strict|off", parseRedact, "default")
  .option("--name <run_name>", "Optional run name")
  .option("--metadata <key=value>", "Metadata entry (repeatable)", parseMetadataOption, [])
  .option("--quiet", "Suppress child process output", false)
  .action(async (options) => {
    const code = await runRecord({
      agent: options.agent,
      out: options.out,
      adapter: options.adapter,
      redact: options.redact,
      name: options.name,
      metadata: options.metadata,
      quiet: options.quiet,
    });

    if (code !== 0) {
      process.exitCode = code;
    }
  });

program
  .command("replay")
  .description("Replay a recorded tape deterministically")
  .argument("<tape-path>", "Path to tape JSONL file")
  .option("--offline", "Replay offline mode", true)
  .option("--mode <mode>", "Replay mode: full|tools-only|llm-only|hybrid", parseMode, "full")
  .option("--live-tool <tool-name>", "Allow specific tool to run live (repeatable)", parseMetadataOption, [])
  .option("--assert-invariants", "Validate tape invariants before replay", false)
  .option("--output <format>", "Output format: summary|json", parseOutput, "summary")
  .option("--fail-on-mismatch", "Return non-zero on mismatch", true)
  .action(async (tapePath, options) => {
    const code = await runReplay({
      tapePath,
      offline: options.offline,
      mode: options.mode,
      liveTool: options.liveTool,
      assertInvariants: options.assertInvariants,
      output: options.output,
      failOnMismatch: options.failOnMismatch,
    });

    if (code !== 0) {
      process.exitCode = code;
    }
  });

program
  .command("diff")
  .description("Compare two AgentTape runs")
  .argument("<baseline-tape>", "Path to baseline tape JSONL file")
  .argument("<current-tape>", "Path to current tape JSONL file")
  .option("--summary", "Summary output", true)
  .option("--json", "JSON output", false)
  .option("--fail-on-change", "Exit non-zero on any non-none change", false)
  .option("--ignore <field>", "Ignore field: timestamps|usage|final_output", parseMetadataOption, [])
  .option(
    "--check <field>",
    "Enable check: tool-sequence|tool-args|tool-results|llm-finish-reason",
    parseMetadataOption,
    [],
  )
  .action(async (baselineTape, currentTape, options) => {
    const code = await runDiff(baselineTape, currentTape, {
      summary: options.summary,
      json: options.json,
      failOnChange: options.failOnChange,
      ignore: options.ignore,
      check: options.check,
    });

    if (code !== 0) {
      process.exitCode = code;
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
