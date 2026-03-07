import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const HOOK_COMMAND = "agenttape claude-hook";

type HookPhase = "PreToolUse" | "PostToolUse" | "Stop" | "Notification";

interface HookEntry {
  type: string;
  command: string;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: Partial<Record<HookPhase, HookMatcher[]>>;
  [key: string]: unknown;
}

function settingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

async function readSettings(path: string): Promise<ClaudeSettings> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    return {};
  }
}

async function writeSettings(path: string, settings: ClaudeSettings): Promise<void> {
  await mkdir(join(homedir(), ".claude"), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

// Check if a specific matcher+command pair already exists in the list
function matcherHasOurHook(matchers: HookMatcher[], matcher: string): boolean {
  return matchers.some((m) => m.matcher === matcher && m.hooks.some((h) => h.command === HOOK_COMMAND));
}

// The hooks we want installed. One matcher per tool group keeps Claude Code's
// settings readable and easy to inspect.
const DESIRED_HOOKS: Array<{ phase: HookPhase; matcher: string; label: string }> = [
  { phase: "PostToolUse", matcher: "Write|Edit|MultiEdit", label: "file writes" },
  { phase: "PostToolUse", matcher: "Bash", label: "shell commands" },
  { phase: "PostToolUse", matcher: "Read", label: "file reads" },
];

export interface HooksOptions {
  /** Reserved for future --local flag */
  global?: boolean;
}

export async function runHooks(subcommand: "install" | "uninstall", _options: HooksOptions): Promise<number> {
  const path = settingsPath();

  if (subcommand === "install") {
    const settings = await readSettings(path);
    if (!settings.hooks) settings.hooks = {};

    let added = 0;

    for (const { phase, matcher, label } of DESIRED_HOOKS) {
      const existing = settings.hooks[phase] ?? [];

      if (matcherHasOurHook(existing, matcher)) {
        console.log(`  ${phase} (${label}): already installed`);
        continue;
      }

      settings.hooks[phase] = [
        ...existing,
        { matcher, hooks: [{ type: "command", command: HOOK_COMMAND }] },
      ];
      added++;
      console.log(`  ${phase} (${label}): added`);
    }

    if (added > 0) {
      await writeSettings(path, settings);
      console.log(`\nWrote ${path}`);
      console.log(`\nClaude Code will now record tool events whenever AGENTTAPE_TAPE_PATH is set.`);
      console.log(`\nUsage:\n  agenttape record --session --agent "claude <your prompt>"`);
    } else {
      console.log(`\nAll hooks already present — nothing changed.`);
    }

    return 0;
  }

  if (subcommand === "uninstall") {
    const settings = await readSettings(path);
    if (!settings.hooks) {
      console.log("No hooks found in settings.");
      return 0;
    }

    let removed = 0;

    for (const phase of Object.keys(settings.hooks) as HookPhase[]) {
      const before = settings.hooks[phase] ?? [];
      const after = before
        .map((m) => ({
          ...m,
          hooks: m.hooks.filter((h) => h.command !== HOOK_COMMAND),
        }))
        .filter((m) => m.hooks.length > 0);

      const delta = before.length - after.length;
      removed += delta;

      if (after.length > 0) {
        settings.hooks[phase] = after;
      } else {
        delete settings.hooks[phase];
      }
    }

    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    await writeSettings(path, settings);
    console.log(`Removed ${removed} hook matcher(s) from ${path}`);
    return 0;
  }

  console.error(`Unknown subcommand: ${subcommand}`);
  return 1;
}
