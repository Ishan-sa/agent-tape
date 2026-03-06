import type { DiffSeverity } from "@agenttape/diff-engine";

export interface AgentTapeConfig {
  testsDir: string;
  ignoreFields: string[];
  failOnMinor: boolean;
}

export interface AgentTestResult {
  name: string;
  baselineTapePath: string;
  currentTapePath?: string;
  pass: boolean;
  severity: DiffSeverity;
  reason?: string;
}

export interface AgentTestRunSummary {
  total: number;
  passed: number;
  failed: number;
  results: AgentTestResult[];
}

export interface AgentTestRunOptions {
  updateBaseline: boolean;
}
