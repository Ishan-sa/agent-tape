# OpenAI Adapter (Minimal)

Package: `@agenttape/adapter-openai`

Implemented:
- `createRunRecorderFromEnv()`
- `wrapOpenAIClient(client, recorder)`
- `wrapTools(tools, recorder)`

## Recording Mode

`agenttape record` sets recording env vars and the adapter appends events to tape:
- `llm_call_started`
- `llm_call_completed`
- `tool_call_started`
- `tool_call_completed`
- terminal `run_completed` or `run_failed`

## Replay Mode

`agenttape replay` sets replay env vars:
- `AGENTTAPE_REPLAY=1`
- `AGENTTAPE_REPLAY_TAPE_PATH=<tape>`
- `AGENTTAPE_REPLAY_MODE=<mode>`

In replay mode:
- wrapped OpenAI calls return recorded LLM outputs from tape
- wrapped tools return recorded tool results from tape
- terminal event recording validates against recorded terminal event
- live model/tool execution is bypassed in `full` mode

## Tool `call_id`

Tool wrappers capture and validate `call_id` when provided by model tool calls.

## Phase 3 Scope

- `full` replay mode is implemented.
- `tools-only`, `llm-only`, and `hybrid` are deferred and currently fail clearly.
