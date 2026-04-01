#!/usr/bin/env bun

import process from 'node:process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startMockOrgsSwitchServer } from './mock-orgs-switch-server';

const tempCacheDir = await mkdtemp(path.join(tmpdir(), 'composio-orgs-switch-demo-'));
const server = await startMockOrgsSwitchServer();
let exitCode = 0;

try {
  const command = Bun.spawn({
    cmd: ['composio', 'orgs', 'switch', '--limit', '1'],
    env: {
      ...process.env,
      COMPOSIO_BASE_URL: server.hostBaseUrl,
      COMPOSIO_CACHE_DIR: tempCacheDir,
      COMPOSIO_USER_API_KEY: 'uak_mock_orgs_switch_demo',
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  exitCode = await command.exited;
} finally {
  await server.close();
  await rm(tempCacheDir, { recursive: true, force: true });
}

process.exitCode = exitCode;
