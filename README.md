# AgentTape

AgentTape is a TypeScript monorepo for recording, replaying, and diffing tool-using AI agent runs.

Implemented now:
- `agenttape record`
- `agenttape replay`
- versioned JSONL tape format (`agenttape.v1`)
- `@agenttape/core` tape writer/reader + IDs + timestamps + redaction
- `@agenttape/adapter-openai` minimal OpenAI-tools-style record/replay wrappers
- `@agenttape/replay-engine` deterministic offline replay for v1 OpenAI-tools flow
- runnable example agent (`examples/support-agent-openai`)

Not implemented yet:
- diff engine behavior

## Quick Start

```bash
pnpm install
pnpm build
pnpm exec agenttape record --agent "node examples/support-agent-openai/index.js"
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline
```

## `agenttape record`

```bash
agenttape record \
  --agent "node examples/support-agent-openai/index.js" \
  --out ./tapes \
  --adapter openai \
  --redact default \
  --name "support-demo" \
  --metadata env=local
```

## `agenttape replay`

```bash
agenttape replay <tape-path> --offline --mode full
```

Phase 3 replay mode support:
- `full`: implemented
- `tools-only`, `llm-only`, `hybrid`: not implemented yet (fails clearly)

Replay summary includes:
- tape path
- mode
- status
- replayed llm/tool call counts
- duration
- mismatch count

## Fixtures

- success tapes: `fixtures/tapes/success/`
- mismatch tapes: `fixtures/tapes/mismatch/`

## License

MIT
