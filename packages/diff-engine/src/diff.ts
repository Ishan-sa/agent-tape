import { readTape, type JsonValue, type TapeEventLine } from "@agenttape/core";
import { evaluateInvariants } from "@agenttape/replay-engine";

import {
  extractFinalOutput,
  extractLlmDecisions,
  extractTerminalStatus,
  extractToolInteractions,
} from "./extract.js";
import type { DiffItem, DiffOptions, DiffReport, DiffSeverity } from "./types.js";
import { deepEqual, maxSeverity } from "./utils.js";

const DEFAULT_OPTIONS: DiffOptions = {
  ignoreTimestamps: true,
  ignoreUsage: true,
  ignoreFinalOutput: false,
  checkToolSequence: true,
  checkToolArgs: true,
  checkToolResults: true,
  checkLlmFinishReason: false,
};

function addDifference(differences: DiffItem[], item: DiffItem): void {
  differences.push(item);
}

function eventTypes(events: TapeEventLine[]): string[] {
  return events.map((event) => event.eventType);
}

function compareEventStructure(
  baseline: TapeEventLine[],
  current: TapeEventLine[],
  options: DiffOptions,
  differences: DiffItem[],
): void {
  if (baseline.length !== current.length) {
    addDifference(differences, {
      kind: "structure.event_count",
      severity: "major",
      message: "Event count changed",
      baseline: baseline.length,
      current: current.length,
    });
  }

  const baselineTypes = eventTypes(baseline);
  const currentTypes = eventTypes(current);
  const max = Math.max(baselineTypes.length, currentTypes.length);

  for (let i = 0; i < max; i += 1) {
    const left = baselineTypes[i] ?? null;
    const right = currentTypes[i] ?? null;
    if (left === right) {
      continue;
    }

    addDifference(differences, {
      kind: "structure.event_order",
      severity: "major",
      message: `Event type sequence mismatch at index ${i}`,
      path: `events[${i}].eventType`,
      baseline: left,
      current: right,
    });
  }

  if (!options.ignoreTimestamps) {
    const len = Math.min(baseline.length, current.length);
    for (let i = 0; i < len; i += 1) {
      if (baseline[i]?.timestamp !== current[i]?.timestamp) {
        addDifference(differences, {
          kind: "structure.timestamp",
          severity: "none",
          message: `Timestamp changed at event ${i}`,
          path: `events[${i}].timestamp`,
          baseline: baseline[i]?.timestamp ?? null,
          current: current[i]?.timestamp ?? null,
        });
      }
    }
  }
}

function compareInvariants(
  baseline: TapeEventLine[],
  current: TapeEventLine[],
  differences: DiffItem[],
): void {
  const baselineInvariantFailures = evaluateInvariants(baseline).filter((result) => !result.ok);
  const currentInvariantFailures = evaluateInvariants(current).filter((result) => !result.ok);

  for (const failure of baselineInvariantFailures) {
    addDifference(differences, {
      kind: "invariant.baseline",
      severity: "breaking",
      message: `Baseline invariant failed: ${failure.name} (${failure.details})`,
    });
  }

  for (const failure of currentInvariantFailures) {
    addDifference(differences, {
      kind: "invariant.current",
      severity: "breaking",
      message: `Current invariant failed: ${failure.name} (${failure.details})`,
    });
  }
}

function compareLlm(
  baseline: TapeEventLine[],
  current: TapeEventLine[],
  options: DiffOptions,
  differences: DiffItem[],
): void {
  const baselineLlm = extractLlmDecisions(baseline);
  const currentLlm = extractLlmDecisions(current);

  if (baselineLlm.length !== currentLlm.length) {
    addDifference(differences, {
      kind: "llm.call_count",
      severity: "major",
      message: "LLM call count changed",
      baseline: baselineLlm.length,
      current: currentLlm.length,
    });
  }

  const len = Math.min(baselineLlm.length, currentLlm.length);
  for (let i = 0; i < len; i += 1) {
    const left = baselineLlm[i];
    const right = currentLlm[i];
    if (!left || !right) {
      continue;
    }

    const leftTools = left.toolCalls.map((tool) => tool.name);
    const rightTools = right.toolCalls.map((tool) => tool.name);
    if (!deepEqual(leftTools, rightTools)) {
      addDifference(differences, {
        kind: "llm.tool_decision",
        severity: "major",
        message: `LLM tool decision changed at call ${i}`,
        baseline: leftTools as JsonValue,
        current: rightTools as JsonValue,
      });
    }

    if (!deepEqual(left.outputText, right.outputText)) {
      addDifference(differences, {
        kind: "llm.output_text",
        severity: "minor",
        message: `LLM output text drift at call ${i}`,
        baseline: left.outputText,
        current: right.outputText,
      });
    }

    if (options.checkLlmFinishReason && !deepEqual(left.finishReason, right.finishReason)) {
      addDifference(differences, {
        kind: "llm.finish_reason",
        severity: "minor",
        message: `LLM finish_reason changed at call ${i}`,
        baseline: left.finishReason,
        current: right.finishReason,
      });
    }

    if (!options.ignoreUsage && !deepEqual(left.usage, right.usage)) {
      addDifference(differences, {
        kind: "llm.usage",
        severity: "minor",
        message: `LLM usage changed at call ${i}`,
        baseline: left.usage,
        current: right.usage,
      });
    }
  }
}

function compareTools(
  baseline: TapeEventLine[],
  current: TapeEventLine[],
  options: DiffOptions,
  differences: DiffItem[],
): void {
  const baselineTools = extractToolInteractions(baseline);
  const currentTools = extractToolInteractions(current);

  if (baselineTools.length !== currentTools.length) {
    addDifference(differences, {
      kind: "tool.call_count",
      severity: "major",
      message: "Tool call count changed",
      baseline: baselineTools.length,
      current: currentTools.length,
    });
  }

  const len = Math.min(baselineTools.length, currentTools.length);
  for (let i = 0; i < len; i += 1) {
    const left = baselineTools[i];
    const right = currentTools[i];
    if (!left || !right) {
      continue;
    }

    if (options.checkToolSequence && left.tool !== right.tool) {
      addDifference(differences, {
        kind: "tool.sequence",
        severity: "major",
        message: `Tool sequence changed at call ${i}`,
        baseline: left.tool,
        current: right.tool,
      });
    }

    if ((left.callId ?? null) !== (right.callId ?? null)) {
      addDifference(differences, {
        kind: "tool.call_id",
        severity: "major",
        message: `Tool call_id changed at call ${i}`,
        baseline: left.callId,
        current: right.callId,
      });
    }

    if (options.checkToolArgs && !deepEqual(left.args, right.args)) {
      addDifference(differences, {
        kind: "tool.arguments",
        severity: "major",
        message: `Tool arguments changed at call ${i}`,
        baseline: left.args,
        current: right.args,
      });
    }

    if (options.checkToolResults && !deepEqual(left.result, right.result)) {
      addDifference(differences, {
        kind: "tool.results",
        severity: "major",
        message: `Tool result changed at call ${i}`,
        baseline: left.result,
        current: right.result,
      });
    }
  }
}

function compareOutcome(
  baseline: TapeEventLine[],
  current: TapeEventLine[],
  options: DiffOptions,
  differences: DiffItem[],
): void {
  const baselineStatus = extractTerminalStatus(baseline);
  const currentStatus = extractTerminalStatus(current);

  if (baselineStatus !== currentStatus) {
    addDifference(differences, {
      kind: "outcome.status",
      severity: "breaking",
      message: "Final status changed",
      baseline: baselineStatus,
      current: currentStatus,
    });
  }

  if (!options.ignoreFinalOutput) {
    const baselineOutput = extractFinalOutput(baseline);
    const currentOutput = extractFinalOutput(current);
    if (!deepEqual(baselineOutput, currentOutput)) {
      addDifference(differences, {
        kind: "outcome.final_output",
        severity: baselineStatus === currentStatus ? "minor" : "breaking",
        message: "Final output drift detected",
        baseline: baselineOutput,
        current: currentOutput,
      });
    }
  }
}

function buildSummary(
  changed: boolean,
  severity: DiffSeverity,
  baselineEvents: number,
  currentEvents: number,
  baselineTools: string[],
  currentTools: string[],
  baselineStatus: string,
  currentStatus: string,
  outputDrift: boolean,
): string {
  const lines = [
    `Diff result: ${changed ? "changed" : "unchanged"}`,
    `Severity: ${severity}`,
    "",
    "Structure:",
    `- baseline events: ${baselineEvents}`,
    `- current events: ${currentEvents}`,
    "",
    "Tool sequence:",
    `- baseline: ${baselineTools.join(" -> ") || "(none)"}`,
    `- current:  ${currentTools.join(" -> ") || "(none)"}`,
    "",
    "Final status:",
    `- baseline: ${baselineStatus}`,
    `- current: ${currentStatus}`,
    "",
    `Output drift: ${outputDrift ? "yes" : "no"}`,
  ];

  return lines.join("\n");
}

export async function diffTapes(
  baselineTapePath: string,
  currentTapePath: string,
  optionsInput: Partial<DiffOptions> = {},
): Promise<DiffReport> {
  const options = {
    ...DEFAULT_OPTIONS,
    ...optionsInput,
  };

  const [baselineTape, currentTape] = await Promise.all([
    readTape(baselineTapePath),
    readTape(currentTapePath),
  ]);

  const baselineEvents = baselineTape.events;
  const currentEvents = currentTape.events;
  const differences: DiffItem[] = [];

  compareInvariants(baselineEvents, currentEvents, differences);
  compareEventStructure(baselineEvents, currentEvents, options, differences);
  compareLlm(baselineEvents, currentEvents, options, differences);
  compareTools(baselineEvents, currentEvents, options, differences);
  compareOutcome(baselineEvents, currentEvents, options, differences);

  const severity = differences.reduce<DiffSeverity>(
    (acc, diff) => maxSeverity(acc, diff.severity),
    "none",
  );

  const changed = severity !== "none";

  const baselineToolSequence = extractToolInteractions(baselineEvents).map((entry) => entry.tool);
  const currentToolSequence = extractToolInteractions(currentEvents).map((entry) => entry.tool);

  const baselineStatus = extractTerminalStatus(baselineEvents);
  const currentStatus = extractTerminalStatus(currentEvents);

  const baselineOutput = extractFinalOutput(baselineEvents);
  const currentOutput = extractFinalOutput(currentEvents);

  const summary = buildSummary(
    changed,
    severity,
    baselineEvents.length,
    currentEvents.length,
    baselineToolSequence,
    currentToolSequence,
    baselineStatus,
    currentStatus,
    !deepEqual(baselineOutput, currentOutput),
  );

  return {
    changed,
    severity,
    summary,
    differences,
    counts: {
      baselineEvents: baselineEvents.length,
      currentEvents: currentEvents.length,
      baselineLlmCalls: extractLlmDecisions(baselineEvents).length,
      currentLlmCalls: extractLlmDecisions(currentEvents).length,
      baselineToolCalls: baselineToolSequence.length,
      currentToolCalls: currentToolSequence.length,
      differences: differences.length,
    },
    metadata: {
      baselineRunId: baselineTape.metadata.runId,
      currentRunId: currentTape.metadata.runId,
      baselineStatus,
      currentStatus,
    },
  };
}
