# OpenAI Adapter (Minimal)

Package: `@agenttape/adapter-openai`

## Purpose

Provide a narrow OpenAI-tools-style integration surface for AgentTape v1.

## Exports

- `createRunRecorderFromEnv()`
- `wrapOpenAIClient(client, recorder)`
- `wrapTools(tools, recorder)`

## Recording Mode

When `agenttape record` sets recording env vars, wrapped calls emit:
- `llm_call_started`
- `llm_call_completed`
- `tool_call_started`
- `tool_call_completed`
- terminal `run_completed` or `run_failed`

## Replay Mode

When `agenttape replay` sets replay env vars, wrappers:
- return recorded LLM outputs from tape
- return recorded tool outputs from tape
- validate terminal runtime event
- avoid live model/tool execution in `full` mode

## Notes

- Designed for current example flow, not full OpenAI API coverage.
- `call_id` is captured and validated for tool events when present.
