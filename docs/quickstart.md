# Quickstart

## Prerequisites

- Node.js 22+
- pnpm 10+

## Install and Build

```bash
pnpm install
pnpm build
```

## Record a Run

```bash
pnpm exec agenttape record --agent "node examples/support-agent-openai/index.js"
```

## Replay a Run Offline

```bash
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline --mode full
```

## Diff Two Runs

Equivalent pair (expect unchanged):

```bash
pnpm exec agenttape diff fixtures/tapes/regression/equivalent-baseline.jsonl fixtures/tapes/regression/equivalent-current.jsonl --summary
```

Output drift pair:

```bash
pnpm exec agenttape diff fixtures/tapes/regression/output-drift-baseline.jsonl fixtures/tapes/regression/output-drift-current.jsonl --summary
```

Tool sequence drift pair with CI failure behavior:

```bash
pnpm exec agenttape diff fixtures/tapes/regression/tool-sequence-baseline.jsonl fixtures/tapes/regression/tool-sequence-current.jsonl --summary --fail-on-change
```

JSON output:

```bash
pnpm exec agenttape diff fixtures/tapes/regression/terminal-status-baseline.jsonl fixtures/tapes/regression/terminal-status-current.jsonl --json
```
