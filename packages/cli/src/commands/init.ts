import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

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

const DESIRED_HOOKS: Array<{ matcher: string; label: string }> = [
  { matcher: "Write|Edit|MultiEdit", label: "file writes" },
  { matcher: "Bash", label: "shell commands" },
  { matcher: "Read", label: "file reads" },
];

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function ensureGitignore(cwd: string): Promise<void> {
  const path = join(cwd, ".gitignore");
  const entry = "agenttape/";
  try {
    const content = await readFile(path, "utf8");
    if (content.split("\n").some((l) => l.trim() === entry)) return;
    await appendFile(path, (content.endsWith("\n") ? "" : "\n") + entry + "\n");
    console.log("  .gitignore    added agenttape/ entry");
  } catch {
    await writeFile(path, entry + "\n");
    console.log("  .gitignore    created with agenttape/ entry");
  }
}

async function installHooks(): Promise<void> {
  const settingsPath = join(homedir(), ".claude", "settings.json");

  let settings: ClaudeSettings = {};
  try {
    const raw = await readFile(settingsPath, "utf8");
    settings = JSON.parse(raw) as ClaudeSettings;
  } catch {
    // File missing or invalid — start fresh
  }

  if (!settings.hooks) settings.hooks = {};
  const existing = settings.hooks.PostToolUse ?? [];

  let added = 0;
  for (const { matcher, label } of DESIRED_HOOKS) {
    const alreadyThere = existing.some(
      (m) => m.matcher === matcher && m.hooks.some((h) => h.command === HOOK_COMMAND),
    );
    if (alreadyThere) {
      console.log(`  claude hooks  PostToolUse(${label}): already installed`);
      continue;
    }
    existing.push({ matcher, hooks: [{ type: "command", command: HOOK_COMMAND }] });
    added++;
    console.log(`  claude hooks  PostToolUse(${label}): installed`);
  }

  if (added > 0) {
    settings.hooks.PostToolUse = existing;
    await mkdir(join(homedir(), ".claude"), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
}

export async function runInit(cwd: string): Promise<number> {
  const projectDir = resolve(cwd);
  console.log(`Initialising AgentTape in ${projectDir}\n`);

  // 1. Create output folders
  const tapesDir = join(projectDir, "agenttape", "tapes");
  const htmlDir = join(projectDir, "agenttape", "html");
  await ensureDir(tapesDir);
  await ensureDir(htmlDir);
  console.log("  agenttape/    created tapes/ and html/ folders");

  // 2. Add to .gitignore
  await ensureGitignore(projectDir);

  // 3. Install Claude Code hooks
  await installHooks();

  console.log(`
Done. Start recording:

  agenttape record --session --agent "claude -p 'your task here'"

Then open the viewer with:

  agenttape ui agenttape/tapes/<date>/<run>.jsonl
`);

  return 0;
}
