#!/usr/bin/env node
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const cliEntry = resolve(__dirname, '..', 'packages', 'cli', 'dist', 'index.js');

if (!existsSync(cliEntry)) {
  console.error('AgentTape CLI is not built. Run: pnpm build');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
