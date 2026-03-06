# Diff in AgentTape v1

## Scope

`agenttape diff` compares two tape files and reports structural and semantic changes.

Checks include:
- event count and event type sequence
- terminal event validity
- llm call count and tool-call decisions
- tool sequence, call_id, args, and results
- final status and final output drift

## CLI

```bash
agenttape diff <baseline-tape> <current-tape> [options]
```

Options:
- `--summary` (default)
- `--json`
- `--fail-on-change`
- `--ignore timestamps|usage|final_output` (repeatable)
- `--check tool-sequence|tool-args|tool-results|llm-finish-reason` (repeatable)

## Severity Model

- `none`: non-meaningful only (for example timestamp-only drift)
- `minor`: usage or output text drift with same flow
- `major`: tool sequence/args/results drift, event count drift
- `breaking`: terminal status mismatch, invariant failures

## CI Behavior

With `--fail-on-change`:
- `none` => exit 0
- `minor|major|breaking` => exit non-zero

Example:

```bash
agenttape diff baseline.jsonl current.jsonl --json --fail-on-change
```

## v1 Defaults

- timestamps are ignored by default
- usage is ignored by default
- terminal/final output are checked unless explicitly ignored

## Limitations

- semantic comparison is tuned for the current OpenAI-tools-style event schema
- richer language-level output quality scoring is deferred
- no visualization UI in v1
