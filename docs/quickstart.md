# Quickstart

## Prerequisites

- Node.js 22+
- pnpm 10+

## Install

```bash
git clone https://github.com/Ishan-sa/agent-tape.git
cd agent-tape
pnpm install
pnpm build
```

## Record

```bash
pnpm exec agenttape record --agent "node examples/support-agent-openai/index.js"
```

Session-mode record:

```bash
pnpm exec agenttape record --session --agent "node examples/support-agent-openai/index.js"
```

## Replay

```bash
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline --mode full
```

## Diff

```bash
pnpm exec agenttape diff fixtures/tapes/regression/equivalent-baseline.jsonl fixtures/tapes/regression/equivalent-current.jsonl --summary
```

## Agent Behavior Tests

```bash
pnpm exec agenttape test
```

Update baselines:

```bash
pnpm exec agenttape test --update-baseline
```
