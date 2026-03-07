#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";

import type { RedactProfile } from "@agenttape/core";
import type { ReplayMode } from "@agenttape/replay-engine";

import { runClaudeHook } from "./commands/claude-hook.js";
import { runInit } from "./commands/init.js";
import { runDiff } from "./commands/diff.js";
import { runEvent } from "./commands/event.js";
import { runHooks } from "./commands/hooks.js";
import { runRecord } from "./commands/record.js";
import { runReplay } from "./commands/replay.js";
import { runTests } from "./commands/test.js";
import { runUi } from "./commands/ui.js";

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
  .option("--out <dir>", "Output directory", "./agenttape/tapes")
  .option("--redact <profile>", "Redaction profile: default|strict|off", parseRedact, "default")
  .option("--session", "Enable generic coding-agent session recording mode", false)
  .option("--name <run_name>", "Optional run name")
  .option("--metadata <key=value>", "Metadata entry (repeatable)", parseMetadataOption, [])
  .option("--quiet", "Suppress child process output", false)
  .action(async (options) => {
    const code = await runRecord({
      agent: options.agent,
      out: options.out,
      redact: options.redact,
      session: options.session,
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
  .option("--verify-files", "Check that files written during session still exist on disk", false)
  .action(async (tapePath, options) => {
    const code = await runReplay({
      tapePath,
      offline: options.offline,
      mode: options.mode,
      liveTool: options.liveTool,
      assertInvariants: options.assertInvariants,
      output: options.output,
      failOnMismatch: options.failOnMismatch,
      verifyFiles: options.verifyFiles,
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

program
  .command("test")
  .description("Run AgentTape regression tests from configured test tapes")
  .option("--update-baseline", "Overwrite baseline tapes with current runs", false)
  .action(async (options) => {
    const code = await runTests({
      updateBaseline: options.updateBaseline,
    });

    if (code !== 0) {
      process.exitCode = code;
    }
  });

program
  .command("event")
  .description("Append a single event to an existing tape (hooks integration)")
  .argument("<payload-json>", "JSON object: {\"eventType\":\"...\",\"payload\":{...}}")
  .option("--tape <path>", "Tape path; defaults to AGENTTAPE_TAPE_PATH")
  .action(async (payloadJson, options) => {
    const code = await runEvent(payloadJson, options.tape);
    if (code !== 0) {
      process.exitCode = code;
    }
  });

program
  .command("init")
  .description("Set up AgentTape in the current project (creates folders, updates .gitignore, installs Claude Code hooks)")
  .action(async () => {
    const code = await runInit(process.cwd());
    if (code !== 0) process.exitCode = code;
  });

program
  .command("ui")
  .description("Generate a self-contained HTML viewer for a tape file")
  .argument("<tape-path>", "Path to tape JSONL file")
  .option("--out <file>", "Output HTML file path (default: <tape>.html)")
  .option("--no-open", "Do not open the file in a browser after generating")
  .action(async (tapePath, options) => {
    const uiOpts: Parameters<typeof runUi>[1] = { open: options.open !== false };
    if (typeof options.out === "string") uiOpts.out = options.out;
    const code = await runUi(tapePath, uiOpts);
    if (code !== 0) {
      process.exitCode = code;
    }
  });

program
  .command("hooks")
  .description("Manage Claude Code hooks for passive session recording")
  .argument("<subcommand>", "install or uninstall")
  .action(async (subcommand: string) => {
    if (subcommand !== "install" && subcommand !== "uninstall") {
      console.error(`Unknown subcommand: ${subcommand}. Use install or uninstall.`);
      process.exitCode = 1;
      return;
    }
    const code = await runHooks(subcommand, {});
    if (code !== 0) {
      process.exitCode = code;
    }
  });

program
  .command("claude-hook")
  .description("Internal: process a Claude Code hook payload from stdin and append to tape")
  .action(async () => {
    const code = await runClaudeHook();
    if (code !== 0) {
      process.exitCode = code;
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
