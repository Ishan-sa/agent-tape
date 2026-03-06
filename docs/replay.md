# Replay (AgentTape v1)

## Definition

Deterministic replay in v1 means:
- recorded LLM outputs are reused (no live model calls)
- recorded tool outputs are reused (no live tool calls)
- runtime must follow the recorded sequence
- mismatches fail loudly

Scope is the current OpenAI-tools-style event flow.

## Command

```bash
agenttape replay <tape-path> [options]
```

Options:
- `--offline` (default true)
- `--mode full|tools-only|llm-only|hybrid`
- `--live-tool <tool-name>` (repeatable)
- `--assert-invariants`
- `--output summary|json`
- `--fail-on-mismatch`

## Mode Support (Current)

- `full`: implemented
- `tools-only`: not implemented yet (fails clearly)
- `llm-only`: not implemented yet (fails clearly)
- `hybrid`: not implemented yet (fails clearly)

## Invariants

When `--assert-invariants` is set, replay validates and prints:
- exactly one terminal event exists
- terminal event is last
- `llm_call_completed` follows `llm_call_started`
- `tool_call_completed` follows `tool_call_started`

## Mismatch Errors

Replay emits clear failures for:
- unexpected event type
- unexpected tool name
- unexpected `call_id`
- missing recorded result
- extra runtime call
