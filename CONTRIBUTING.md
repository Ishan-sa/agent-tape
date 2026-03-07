# Contributing to AgentTape

Thanks for contributing.

## Development Setup

```bash
pnpm install
pnpm build
pnpm typecheck
```

## Verification Before PR

```bash
pnpm test
```

This runs build, typecheck, and fixture-based replay/diff verification.

## Pull Request Guidelines

- Keep scope focused and incremental.
- Update docs for any behavior change.
- Add or update fixtures when changing replay/diff semantics.
- Keep CLI output stable and machine-parseable where documented.

## Commit Style

Preferred:
- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`

## Reporting Bugs

Open a GitHub issue with:
- command used
- tape files involved
- expected vs actual behavior
- error output
- environment (`node -v`, `pnpm -v`)
