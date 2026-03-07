#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

// When installed from npm: @agenttape/cli is a real dependency in node_modules
// When running in the monorepo (dev): fall back to packages/cli/dist
let cliEntry;
try {
  cliEntry = require.resolve('@agenttape/cli');
} catch {
  const { existsSync } = require('node:fs');
  const { resolve } = require('node:path');
  const dev = resolve(__dirname, '..', 'packages', 'cli', 'dist', 'index.js');
  if (!existsSync(dev)) {
    console.error('AgentTape CLI is not built. Run: pnpm build');
    process.exit(1);
  }
  cliEntry = dev;
}

const result = spawnSync(process.execPath, [cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

process.exit(typeof result.status === 'number' ? result.status : 1);
