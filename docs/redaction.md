# Redaction

AgentTape can redact sensitive payload fields during recording.

## Profiles

- `default`
  - common secret/token masking
  - common auth header masking
- `strict`
  - includes `default` plus broader PII-oriented patterns
- `off`
  - no redaction

Use with:

```bash
agenttape record --redact default
```

## Where Redaction Applies

- applied on write path in `@agenttape/core` tape writer
- affects persisted payload values in tape JSONL

## Tradeoffs

- stronger redaction reduces leakage risk
- stronger redaction can hide useful debug context

Choose profile based on data sensitivity and compliance requirements.
