# Diff (AgentTape v1)

`agenttape diff` compares two tape files and reports structural + semantic drift.

## Command

```bash
agenttape diff <baseline-tape> <current-tape> [options]
```

Options:
- `--summary` (default)
- `--json`
- `--fail-on-change`
- `--ignore timestamps|usage|final_output` (repeatable)
- `--check tool-sequence|tool-args|tool-results|llm-finish-reason` (repeatable)

## What Is Compared

Structure:
- event count
- event type sequence
- terminal event validity

LLM behavior:
- llm call count
- tool decisions
- output text drift
- optional finish_reason drift

Tool behavior:
- tool sequence
- tool names
- `call_id` alignment
- arguments/results drift
- missing/extra tool calls

Run outcome:
- final status
- final output drift

## Severity

- `none`: non-meaningful only
- `minor`: output/usage-style drift
- `major`: structural/tool-flow drift
- `breaking`: terminal status or invariant breakage

## Fail-On-Change Rule

With `--fail-on-change`:
- `none` => exit 0
- `minor|major|breaking` => exit non-zero

Use this directly in CI gates.
