# Fixtures

- Success tapes: `fixtures/tapes/success/`
- Mismatch tapes: `fixtures/tapes/mismatch/`
- Regression diff pairs: `fixtures/tapes/regression/`

Key replay-ready success fixture:
- `fixtures/tapes/success/2026-03-06/run_4a5b2aec-c400-463d-95cd-47133dc14b36.jsonl`

Regression pairs:
- equivalent: `equivalent-baseline.jsonl` vs `equivalent-current.jsonl`
- output drift: `output-drift-baseline.jsonl` vs `output-drift-current.jsonl`
- tool sequence drift: `tool-sequence-baseline.jsonl` vs `tool-sequence-current.jsonl`
- terminal status drift: `terminal-status-baseline.jsonl` vs `terminal-status-current.jsonl`
