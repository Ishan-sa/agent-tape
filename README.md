# AgentTape

Universal record/replay/diff harness for tool-using AI agents.

AgentTape helps engineers reproduce agent failures and detect regressions by storing runs as portable JSONL tapes, replaying them offline, and diffing behavior between runs.

## Why AgentTape Exists

Teams building tool-using agents run into the same problem repeatedly:
- a run fails in prod
- you cannot deterministically reproduce it locally
- changes to prompts/tools silently alter behavior
- regressions are hard to catch before merge

AgentTape solves this by giving you a stable run artifact and deterministic tooling around it.

## What Problem It Solves

AgentTape makes agent runs:
- recordable: save run behavior to versioned JSONL
- replayable: rerun offline without live model/tool dependencies
- comparable: diff baseline vs current and surface meaningful drift

## Install

Prerequisites:
- Node.js 22+
- pnpm 10+

```bash
git clone https://github.com/Ishan-sa/agent-tape.git
cd agent-tape
pnpm install
pnpm build
```

## Quickstart

Record:
```bash
pnpm exec agenttape record --agent "node examples/support-agent-openai/index.js"
```

Replay:
```bash
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline --mode full
```

Diff:
```bash
pnpm exec agenttape diff fixtures/tapes/regression/equivalent-baseline.jsonl fixtures/tapes/regression/equivalent-current.jsonl --summary
```

## CLI Examples

Record with metadata and redaction:
```bash
pnpm exec agenttape record \
  --agent "node examples/support-agent-openai/index.js" \
  --out ./tapes \
  --redact default \
  --metadata env=local \
  --metadata team=agent
```

Replay with invariant checks:
```bash
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl \
  --offline \
  --mode full \
  --assert-invariants
```

Diff with CI fail behavior:
```bash
pnpm exec agenttape diff \
  fixtures/tapes/regression/tool-sequence-baseline.jsonl \
  fixtures/tapes/regression/tool-sequence-current.jsonl \
  --summary \
  --fail-on-change
```

## Example Tape Snippet

```json
{"lineType":"event","eventType":"llm_call_started","payload":{"model":"gpt-4.1-mini","hasTools":true,"input":"..."}}
{"lineType":"event","eventType":"tool_call_completed","payload":{"tool":"lookup_pricing","call_id":"tool-call-2","ok":true,"result":{"plan":"pro","price":"$49/month"}}}
{"lineType":"event","eventType":"run_completed","payload":{"answer":"...","toolCallCount":2}}
```

## Privacy and Redaction

AgentTape records request/response and tool payloads. Use redaction profiles in `record`:
- `default`: common secret/token masking
- `strict`: adds broader sensitive-field patterns
- `off`: disables redaction

See [docs/redaction.md](docs/redaction.md) for policy details and caveats.

## Project Structure

```text
packages/core            # Tape types, schema validation, reader/writer, redaction
packages/adapter-openai  # Minimal OpenAI-tools-style record/replay integration
packages/replay-engine   # Deterministic offline replay engine
packages/diff-engine     # Semantic tape diff engine with severity model
packages/cli             # agenttape CLI (record/replay/diff)
examples/                # Runnable local example agent
fixtures/                # Success/mismatch/regression tape fixtures
docs/                    # User and maintainer docs
spec/                    # JSON schema for tape format
```

## Roadmap

Near-term:
- stabilize diff semantics and check controls
- improve fixture coverage and edge-case docs
- add release versioning and changelog cadence

Later:
- additional adapters
- richer CI integration patterns
- deeper semantic comparison options

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

Typical local verification before PR:
```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## License

MIT
