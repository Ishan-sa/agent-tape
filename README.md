# AgentTape

AgentTape is a TypeScript monorepo for recording, replaying, and diffing tool-using AI agent runs.

Implemented now:
- `agenttape record`
- `agenttape replay`
- `agenttape diff`
- versioned JSONL tape format (`agenttape.v1`)
- `@agenttape/core`, `@agenttape/replay-engine`, `@agenttape/diff-engine`
- `@agenttape/adapter-openai` minimal OpenAI-tools-style record/replay wrappers

Not implemented yet:
- advanced diff visualizations or UI

## Quick Start

```bash
pnpm install
pnpm build
pnpm exec agenttape record --agent "node examples/support-agent-openai/index.js"
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline
pnpm exec agenttape diff fixtures/tapes/regression/equivalent-baseline.jsonl fixtures/tapes/regression/equivalent-current.jsonl --summary
```

## `agenttape diff`

```bash
agenttape diff <baseline-tape> <current-tape> [options]
```

Options:
- `--summary` (default)
- `--json`
- `--fail-on-change`
- `--ignore timestamps`
- `--ignore usage`
- `--ignore final_output`
- `--check tool-sequence`
- `--check tool-args`
- `--check tool-results`
- `--check llm-finish-reason`

Default behavior:
- summary output
- timestamps ignored
- usage ignored
- `--fail-on-change` exits non-zero on any `minor|major|breaking` severity

## Fixtures

- success tapes: `fixtures/tapes/success/`
- mismatch tapes: `fixtures/tapes/mismatch/`
- regression diff fixtures: `fixtures/tapes/regression/`

## License

MIT
