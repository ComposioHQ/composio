import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as tempy from 'tempy';

describe('CLI process error handling', () => {
  it('prints unreported ToolExecutionError failures and exits non-zero', () => {
    const configDirectory = tempy.temporaryDirectory();
    fs.writeFileSync(
      path.join(configDirectory, 'config.json'),
      JSON.stringify({ experimental_features: { local_tools: true } })
    );
    fs.writeFileSync(
      path.join(configDirectory, 'user_data.json'),
      JSON.stringify({
        api_key: null,
        base_url: 'https://backend.composio.dev',
        web_url: 'https://platform.composio.dev',
        org_id: null,
        test_user_id: null,
      })
    );

    const result = spawnSync(
      'bun',
      [
        'run',
        'src/bin.ts',
        'execute',
        'LOCAL_PEEKABOO_VERSION',
        '--file',
        '/tmp/does-not-matter',
        '-d',
        '{}',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: '1',
          NO_COLOR: '1',
          COMPOSIO_CACHE_DIR: configDirectory,
        },
      }
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      '--file is not supported for local tools yet.'
    );
  });

  it('normalizes telemetry debug before dispatching a background worker', () => {
    const configDirectory = tempy.temporaryDirectory();
    const encodedPayload = Buffer.from(
      JSON.stringify({
        event: 'worker_bootstrap_test',
        sentAt: '2026-08-14T00:00:00.000Z',
        source: 'cli',
        distinctId: 'install_test',
        installId: 'install_test',
      })
    ).toString('base64url');

    const result = spawnSync(
      'bun',
      ['run', 'src/bin.ts', '__analytics-worker', encodedPayload, '--telemetry-debug'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'true',
          NO_COLOR: '1',
          COMPOSIO_CACHE_DIR: configDirectory,
        },
      }
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('[telemetry-debug]');
    expect(`${result.stdout}\n${result.stderr}`).toContain('posthog_delivery_skipped');
  });
});
