# AgentTape

Record, replay, diff, and regression-test your Claude Code agent sessions.

AgentTape captures every tool call, file write, and shell command Claude makes during a session — turning it into a versioned JSONL tape you can replay offline, diff against a baseline, and share as a self-contained HTML report.

---

## Demo

https://github.com/user-attachments/assets/3cd0fe92-9a88-41ae-9759-c38c7482b336

---

## Why

Claude Code shows you what it's doing in real-time — but once a session ends, that's it. There's no structured artifact you can replay, no way to diff two runs of the same task, and no way to catch behavioural drift in CI.

AgentTape fixes that:

- **Debug** — see the exact sequence of tool calls and file reads that produced a result
- **Replay offline** — re-run a session without hitting the API, deterministically
- **Diff** — compare two sessions and get a severity-rated list of what changed
- **Regression test** — save a good session as a baseline; CI fails when behaviour drifts

---

## Install

```bash
npm install -g agenttape
```

Or with npx (no install needed):

```bash
npx agenttape --help
```

Requirements: **Node.js 22+**

---

## Quickstart

**1. Set up in your project (one time)**

```bash
cd your-project
agenttape init
```

This creates `agenttape/` folders, adds them to `.gitignore`, and installs Claude Code hooks so recording is automatic.

**2. Record a session**

```bash
agenttape record --session --agent "claude -p 'find all console.log statements and remove them'"
```

Claude runs normally. When it finishes, a browser tab opens with the HTML viewer automatically.

**3. That's it**

Your tape lives at `agenttape/tapes/<date>/<run-id>.jsonl`.
Your viewer lives at `agenttape/html/<date>/<run-id>.html`.
Neither is committed to git.

---

## Commands

### `agenttape init`

Sets up AgentTape in your project:
- Creates `agenttape/tapes/` and `agenttape/html/`
- Adds `agenttape/` to `.gitignore`
- Installs Claude Code hooks (`~/.claude/settings.json`)

```bash
agenttape init
```

---

### `agenttape record`

Records a Claude Code session. Spawns your agent command, captures all tool events via the installed hooks, and generates an HTML viewer when done.

```bash
agenttape record --session --agent "claude -p 'your task'"
```

| Option | Default | Description |
|---|---|---|
| `--agent <cmd>` | required | Command to run |
| `--session` | false | Enable session mode (captures file writes, commands, git commits) |
| `--out <dir>` | `./agenttape/tapes` | Where to write tapes |
| `--redact <profile>` | `default` | Redaction: `default` \| `strict` \| `off` |
| `--name <name>` | — | Optional label for this run |
| `--quiet` | false | Suppress agent output |

Output:

```
run_id=run_abc123
tape_path=agenttape/tapes/2026-03-07/run_abc123.jsonl
event_count=23
status=completed
html_path=agenttape/html/2026-03-07/run_abc123.html
```

---

### `agenttape ui`

Generate (or regenerate) the HTML viewer for any tape.

```bash
agenttape ui agenttape/tapes/2026-03-07/run_abc123.jsonl
```

Opens in your browser automatically. Pass `--no-open` to just write the file.

---

### `agenttape replay`

Replay a tape offline. Returns the same LLM and tool responses that were recorded — no API calls.

```bash
agenttape replay agenttape/tapes/2026-03-07/run_abc123.jsonl
```

Useful for verifying a tape is intact, debugging without spending credits, or running in CI.

---

### `agenttape diff`

Compare two tapes. Reports what changed and at what severity.

```bash
agenttape diff baseline.jsonl current.jsonl --summary
```

Severity levels:

| Level | Meaning |
|---|---|
| `none` | Only timestamps or irrelevant metadata changed |
| `minor` | Output text drifted but tool flow is the same |
| `major` | Tool sequence or call counts changed |
| `breaking` | Run failed or terminal status changed |

Use `--fail-on-change` to gate CI on any change.

---

### `agenttape test`

Run tape-based regression tests. Stores baseline tapes in `agent-tests/`, re-runs the agent, diffs against the baseline.

```bash
agenttape test
agenttape test --update-baseline   # accept current run as new baseline
```

Configure in `agenttape.config.json`:

```json
{
  "testsDir": "agent-tests",
  "ignoreFields": ["timestamp"],
  "failOnMinor": false
}
```

To add a baseline: copy a tape from `agenttape/tapes/` into `agent-tests/` and rename it descriptively (`add-auth.tape.jsonl`).

---

### `agenttape hooks`

Manage Claude Code hooks manually (if you didn't use `init`).

```bash
agenttape hooks install
agenttape hooks uninstall
```

Hooks write to `~/.claude/settings.json`. They capture:
- `Write`, `Edit`, `MultiEdit` → `file_written` events
- `Bash` → `command_executed` events
- `Read` → `read_file` events

Hooks are **no-ops** unless `AGENTTAPE_TAPE_PATH` is set in the environment — safe to install globally, they do nothing outside a recording session.

---

## How it works

```
agenttape record --session --agent "claude ..."
       │
       ├─ creates tape file, sets AGENTTAPE_TAPE_PATH in env
       ├─ spawns claude as a child process
       │
       │   claude runs...
       │   ├─ reads files   → PostToolUse hook → agenttape claude-hook → appends read_file event
       │   ├─ writes files  → PostToolUse hook → agenttape claude-hook → appends file_written event
       │   └─ runs commands → PostToolUse hook → agenttape claude-hook → appends command_executed event
       │
       ├─ record waits for claude to exit
       ├─ appends run_completed event
       ├─ generates HTML viewer
       └─ opens browser
```

---

## Tape format

Tapes are JSONL files. First line is metadata, subsequent lines are events:

```jsonl
{"lineType":"meta","format":"agenttape.v1","runId":"run_abc","createdAt":"...","agent":"claude -p ..."}
{"lineType":"event","sequence":1,"eventType":"run_started","payload":{"mode":"session",...}}
{"lineType":"event","sequence":2,"eventType":"read_file","payload":{"path":"src/auth.ts"}}
{"lineType":"event","sequence":3,"eventType":"file_written","payload":{"path":"src/auth.ts","tool":"Edit"}}
{"lineType":"event","sequence":4,"eventType":"command_executed","payload":{"command":"npm test","exitCode":0}}
{"lineType":"event","sequence":5,"eventType":"run_completed","payload":{}}
```

Full spec: [docs/spec.md](docs/spec.md)

---

## Privacy

Recording captures file paths, commands, and LLM inputs/outputs. Redaction is on by default:

| Profile | What it redacts |
|---|---|
| `default` | API keys, bearer tokens, `authorization` and `password` fields |
| `strict` | Everything above + email addresses, phone numbers |
| `off` | Nothing |

```bash
agenttape record --redact strict --session --agent "claude ..."
```

---

## Project structure

```
packages/core               # tape schema, reader, writer, redaction
packages/replay-engine      # deterministic offline replay
packages/diff-engine        # semantic diff + severity
packages/test-runner        # tape-based regression tests
packages/integration-claude # Claude Code hooks + MCP server utilities
packages/cli                # agenttape CLI
docs/                       # additional documentation
fixtures/                   # fixture tapes for CI (replay/diff verification)
agent-tests/                # your baseline tapes for regression testing
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
pnpm install
pnpm build
pnpm test
```

---

## License

MIT — [Ishan Sachdeva](https://github.com/Ishan-sa)
