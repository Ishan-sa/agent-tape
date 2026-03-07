# Quickstart

## Prerequisites

- Node.js 22+
- [Claude Code](https://claude.ai/code) installed and on your PATH

## Install

```bash
npm install -g agenttape
```

## Set up in your project

Run once per project:

```bash
cd your-project
agenttape init
```

This creates `agenttape/tapes/` and `agenttape/html/` folders, adds `agenttape/` to your `.gitignore`, and installs Claude Code hooks so all tool events are captured automatically.

## Record a session

```bash
agenttape record --session --agent "claude -p 'your task here'"
```

Claude runs normally. When it finishes the HTML viewer opens in your browser automatically.

## View a tape

```bash
agenttape ui agenttape/tapes/<date>/<run-id>.jsonl
```

## Replay offline

```bash
agenttape replay agenttape/tapes/<date>/<run-id>.jsonl
```

## Diff two sessions

```bash
agenttape diff agenttape/tapes/<date>/run-a.jsonl agenttape/tapes/<date>/run-b.jsonl --summary
```

## Regression test

Copy a tape you're happy with into `agent-tests/`:

```bash
cp agenttape/tapes/2026-03-07/run_abc.jsonl agent-tests/my-feature.tape.jsonl
```

Run tests:

```bash
agenttape test
```

Update baselines when behaviour intentionally changes:

```bash
agenttape test --update-baseline
```
