# Replay in AgentTape v1

## What Replay Means in v1

Deterministic replay in AgentTape v1 means:
- recorded model outputs are replayed without live model calls
- recorded tool outputs are replayed without live tool calls
- runtime must follow the same event sequence as tape
- mismatches stop replay with clear errors

This is implemented for the current OpenAI-tools-style flow in `full` mode.

## CLI

```bash
agenttape replay <tape-path> [options]
```

Options:
- `--offline` (default `true`)
- `--mode full|tools-only|llm-only|hybrid`
- `--live-tool <tool-name>` (repeatable)
- `--assert-invariants`
- `--output summary|json`
- `--fail-on-mismatch`

## Supported Modes (Phase 3)

- `full`: fully supported
- `tools-only`: not implemented yet (fails clearly)
- `llm-only`: not implemented yet (fails clearly)
- `hybrid`: not implemented yet (fails clearly)

## Invariants

Current invariants:
- exactly one terminal event exists
- terminal event is last
- `llm_call_completed` must follow `llm_call_started`
- `tool_call_completed` must follow `tool_call_started`

With `--assert-invariants`, replay prints pass/fail per invariant and aborts on failures.

## Mismatch Failures

Replay fails loudly on:
- unexpected event type
- unexpected tool name
- unexpected `call_id`
- missing recorded result
- extra runtime call

## Limitations in v1

- deterministic guarantee is scoped to recorded OpenAI-tools event sequence
- no diff output yet (Phase 4)
- non-`full` replay modes are deferred
