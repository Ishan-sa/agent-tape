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

Expected output:
- `run_id=<...>`
- `tape_path=<...>.jsonl`
- `event_count=<number>`
- `status=completed`

## Replay a Run Offline

```bash
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline --mode full
```

Expected summary:
- `Status: success`
- `Replayed LLM calls: 2`
- `Replayed tool calls: 2`
- `Mismatches: 0`

## Assert Invariants

```bash
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --offline --mode full --assert-invariants
```

## JSON Output

```bash
pnpm exec agenttape replay fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl --output json
```
