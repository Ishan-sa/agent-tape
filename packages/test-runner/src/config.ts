import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AgentTapeConfig } from "./types.js";

const DEFAULT_CONFIG: AgentTapeConfig = {
  testsDir: "agent-tests",
  ignoreFields: ["timestamp", "token_usage"],
  failOnMinor: false,
};

export async function loadAgentTapeConfig(cwd = process.cwd()): Promise<AgentTapeConfig> {
  const path = resolve(cwd, "agenttape.config.json");

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentTapeConfig>;

    return {
      testsDir: parsed.testsDir ?? DEFAULT_CONFIG.testsDir,
      ignoreFields: parsed.ignoreFields ?? DEFAULT_CONFIG.ignoreFields,
      failOnMinor: parsed.failOnMinor ?? DEFAULT_CONFIG.failOnMinor,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
