import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as tempy from 'tempy';

describe('CLI process error handling', () => {
  it('records help and version as successes and invalid help as a failure', () => {
    const configDirectory = tempy.temporaryDirectory();
    for (const args of [[], ['help'], ['--help'], ['--version'], ['help', 'orgz']]) {
      const result = spawnSync('bun', ['run', 'src/bin.ts', ...args], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: '1',
          NO_COLOR: '1',
          COMPOSIO_CACHE_DIR: configDirectory,
          COMPOSIO_CLI_TELEMETRY_DISABLED: '1',
          COMPOSIO_CLI_TELEMETRY_DEBUG: '1',
        },
      });
      const invalid = args.includes('orgz');
      expect(result.status).toBe(invalid ? 1 : 0);
      expect(result.stderr).toContain(invalid ? 'CLI_COMMAND_FAILED' : 'CLI_COMMAND_SUCCEEDED');
      expect(result.stderr).not.toContain(invalid ? 'CLI_COMMAND_SUCCEEDED' : 'CLI_COMMAND_FAILED');
    }
  });

  it('prints unreported typed execute failures and exits non-zero', () => {
    const configDirectory = tempy.temporaryDirectory();
    fs.writeFileSync(
      path.join(configDirectory, 'user_data.json'),
      JSON.stringify({
        api_key: 'test-api-key',
        base_url: 'https://backend.composio.dev',
        web_url: 'https://platform.composio.dev',
        org_id: null,
        test_user_id: null,
      })
    );

    const result = spawnSync(
      'bun',
      ['run', 'src/bin.ts', 'execute', 'GITHUB_GET_THE_AUTHENTICATED_USER', '-d', '[]'],
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
      'Expected a JSON object for tool arguments'
    );
  });

  it('reports a bare `composio run` as a usage error without a defect dump', () => {
    const configDirectory = tempy.temporaryDirectory();

    const result = spawnSync('bun', ['run', 'src/bin.ts', 'run'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        COMPOSIO_CACHE_DIR: configDirectory,
      },
    });

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('Provide inline code or use --file to run a script file.');
    // No defect banner, no source-mapped stack, and no run artifacts for a script that never ran.
    expect(output).not.toContain('MissingRunSourceError');
    expect(output).not.toContain('Sources');
    expect(output).not.toContain('RUN_LOG_FILE=');
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
