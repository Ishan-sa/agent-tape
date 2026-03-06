# Tape Spec (v1)

Canonical schema file:
- `spec/agenttape-v1.schema.json`

Format:
- JSONL
- first line: `meta`
- subsequent lines: `event`

## Metadata Line

Required fields:
- `lineType: "meta"`
- `format: "agenttape.v1"`
- `runId`
- `createdAt`

Optional:
- `agent`
- `source`
- `tags`

## Event Line

Required fields:
- `lineType: "event"`
- `id`
- `runId`
- `sequence`
- `timestamp`
- `eventType`
- `payload`

Supported event types:
- `run_started`
- `llm_call_started`
- `llm_call_completed`
- `tool_call_started`
- `tool_call_completed`
- `run_completed`
- `run_failed`

## Compatibility Notes

- v1 is focused on OpenAI-tools-style flow.
- schema is strict on required top-level fields.
- payload shape is JSON-value based and interpreted by engine/adapter logic.
