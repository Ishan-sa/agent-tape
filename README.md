# AgentTape

Universal record/replay/diff/test harness for tool-using coding agents.

AgentTape captures agent behavior as versioned JSONL tapes so teams can reproduce failures, replay offline, diff regressions, and run behavior tests in CI.

## Why AgentTape Exists

Agent workflows are hard to debug and harder to stabilize:
- failures are hard to reproduce after the fact
- tool choices drift silently between commits
- regression checks are usually ad hoc

AgentTape turns each run into a deterministic artifact you can replay and compare.

## The Problem It Solves

AgentTape gives you:
- `record`: persist a run as a tape
- `replay`: verify behavior offline against recorded truth
- `diff`: compare baseline vs current runs with severity
- `test`: run tape-based regression tests from `agent-tests/`

## Install

Requirements:
- Node.js 22+
- pnpm 10+

```bash
git clone https://github.com/Ishan-sa/agent-tape.git
cd agent-tape
pnpm install
pnpm build
```

## Quickstart

```bash
pnpm exec agenttape record --agent "node examples/support-agent-openai/index.js"
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline --mode full
pnpm exec agenttape diff fixtures/tapes/regression/equivalent-baseline.jsonl fixtures/tapes/regression/equivalent-current.jsonl --summary
pnpm exec agenttape test
```

## Record Example

```bash
pnpm exec agenttape record \
  --agent "node examples/support-agent-openai/index.js" \
  --out ./tapes \
  --redact default \
  --metadata env=local
```

## Replay Example

```bash
pnpm exec agenttape replay \
  fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl \
  --offline \
  --mode full \
  --assert-invariants
```

## Diff Example

```bash
pnpm exec agenttape diff \
  fixtures/tapes/regression/tool-sequence-baseline.jsonl \
  fixtures/tapes/regression/tool-sequence-current.jsonl \
  --summary \
  --fail-on-change
```

## Agent Behavior Testing

Tape-based tests live in `agent-tests/`:

```text
agent-tests/
  create-homepage.tape.jsonl
  update-auth.tape.jsonl
```

Run tests:

```bash
pnpm exec agenttape test
```

Update baselines intentionally:

```bash
pnpm exec agenttape test --update-baseline
```

Config file (`agenttape.config.json`):

```json
{
  "testsDir": "agent-tests",
  "ignoreFields": ["timestamp", "token_usage"],
  "failOnMinor": false
}
```

## Claude Code Integration

AgentTape includes `@agenttape/integration-claude` with:
- hooks-friendly event append helpers
- optional stdio RPC server (`agenttape-claude-mcp`) exposing:
  - `record_read_file`
  - `record_write_file`
  - `record_run_command`
  - `record_tool_call`

You can also append events directly with:

```bash
pnpm exec agenttape event '{"eventType":"write_file","payload":{"path":"app/page.tsx"}}' --tape ./tapes/2026-03-06/run_x.jsonl
```

## Generic Coding-Agent Session Recording

Enable session mode:

```bash
pnpm exec agenttape record --session --agent "your-agent-command"
```

Session mode records high-level session events such as:
- `run_command`
- `git_commit`
- plus any hook-emitted events (`read_file`, `write_file`, `command_executed`, etc.)

## Using AgentTape with Cursor and Codex

Use AgentTape in two practical ways:
- wrap agent runs with `agenttape record --agent ...`
- emit tool/filesystem/shell events via hooks using `agenttape event ...`

This works for Cursor/Codex/Claude-style coding loops where shell + file actions are central.

## Example Tape Snippet

```json
{"lineType":"event","eventType":"read_file","payload":{"path":"app/page.tsx"}}
{"lineType":"event","eventType":"write_file","payload":{"path":"components/testimonials.tsx"}}
{"lineType":"event","eventType":"run_command","payload":{"command":"npm run build","exitCode":0}}
```

## Privacy and Redaction

Recording can capture sensitive data. Redaction profiles:
- `default`
- `strict`
- `off`

Use:

```bash
pnpm exec agenttape record --redact default --agent "..."
```

See [docs/redaction.md](docs/redaction.md).

## Project Structure

```text
packages/core               # tape schema/types/reader/writer/redaction
packages/adapter-openai     # openai-tools-style record/replay wrapper
packages/replay-engine      # deterministic replay engine
packages/diff-engine        # semantic diff + severity
packages/test-runner        # tape-based regression tests
packages/integration-claude # claude hooks + optional stdio RPC recorder
packages/cli                # agenttape command-line interface
examples/                   # runnable local example
fixtures/                   # success/mismatch/regression fixtures
agent-tests/                # baseline tapes for agent behavior tests
docs/                       # user and maintainer docs
```

## Roadmap

Near-term:
- improve replay coverage for additional modes beyond `full`
- improve diff granularity controls
- harden CI matrix and fixture breadth

Later:
- additional adapters and integrations
- richer reporting formats for CI annotations

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Local verification before PR:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## License

MIT
