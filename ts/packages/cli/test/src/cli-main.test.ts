import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as tempy from 'tempy';

describe('CLI process error handling', () => {
  it.each([
    { args: [], status: 0, recorded: 'CLI_COMMAND_SUCCEEDED', absent: 'CLI_COMMAND_FAILED' },
    { args: ['help'], status: 0, recorded: 'CLI_COMMAND_SUCCEEDED', absent: 'CLI_COMMAND_FAILED' },
    {
      args: ['--help'],
      status: 0,
      recorded: 'CLI_COMMAND_SUCCEEDED',
      absent: 'CLI_COMMAND_FAILED',
    },
    {
      args: ['--version'],
      status: 0,
      recorded: 'CLI_COMMAND_SUCCEEDED',
      absent: 'CLI_COMMAND_FAILED',
    },
    {
      args: ['help', 'orgz'],
      status: 1,
      recorded: 'CLI_COMMAND_FAILED',
      absent: 'CLI_COMMAND_SUCCEEDED',
    },
  ])(
    'records help and version as successes and invalid help as a failure: `composio $args` is $recorded',
    ({ args, status, recorded, absent }) => {
      const configDirectory = tempy.temporaryDirectory();
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
      expect(result.status).toBe(status);
      expect(result.stderr).toContain(recorded);
      expect(result.stderr).not.toContain(absent);
    }
  );

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

  it('reports a missing login as one line and exits non-zero without a defect dump', () => {
    const configDirectory = tempy.temporaryDirectory();

    const result = spawnSync('bun', ['run', 'src/bin.ts', 'tools', 'list', 'gmail'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        COMPOSIO_CACHE_DIR: configDirectory,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('You are not logged in yet. Please run `composio login`.');
    expect(result.stderr).not.toContain('NotLoggedInError');
    expect(result.stderr).not.toContain('Sources');
  });

  it('reports an unresolved project as one line and exits non-zero without a defect dump', () => {
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

    const result = spawnSync('bun', ['run', 'src/bin.ts', 'connections', 'list'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        COMPOSIO_CACHE_DIR: configDirectory,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'No current org configured. Run `composio login` or `composio dev orgs switch`.'
    );
    expect(result.stderr).not.toContain('ProjectResolutionError');
    expect(result.stderr).not.toContain('Sources');
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

describe('CLI backend of a stored login', () => {
  const STAGING_BASE_URL = 'https://staging-backend.composio.dev';

  /** A cache dir holding a stored login issued by `baseURL`. */
  const storedLogin = (baseURL: string) => {
    const configDirectory = tempy.temporaryDirectory();
    fs.writeFileSync(
      path.join(configDirectory, 'user_data.json'),
      JSON.stringify({ api_key: 'uak_stored', base_url: baseURL, web_url: null, org_id: 'org_1' })
    );
    return configDirectory;
  };

  /** The environment of a spawned CLI: no backend variables from the host, telemetry off. */
  const cliEnv = (configDirectory: string, extra: Record<string, string> = {}) => {
    const {
      COMPOSIO_BASE_URL: _baseURL,
      COMPOSIO_WEB_URL: _webURL,
      COMPOSIO_ENVIRONMENT: _environment,
      COMPOSIO_USER_API_KEY: _apiKey,
      ...host
    } = process.env;
    return {
      ...host,
      CI: '1',
      NO_COLOR: '1',
      HOME: configDirectory,
      COMPOSIO_CACHE_DIR: configDirectory,
      COMPOSIO_CLI_TELEMETRY_DISABLED: '1',
      ...extra,
    };
  };

  it('warns on stderr only when an env var sends the stored key to another backend', () => {
    const configDirectory = storedLogin(STAGING_BASE_URL);

    const result = spawnSync('bun', ['run', 'src/bin.ts', '--version'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: cliEnv(configDirectory, { COMPOSIO_BASE_URL: 'http://127.0.0.1:9' }),
    });

    expect(result.status).toBe(0);
    const warning =
      'COMPOSIO_BASE_URL sends your stored API key to http://127.0.0.1:9, but it was issued by https://staging-backend.composio.dev.';
    expect(result.stderr.split(warning)).toHaveLength(2);
    expect(result.stdout).not.toContain('COMPOSIO_BASE_URL');

    const unset = spawnSync('bun', ['run', 'src/bin.ts', '--version'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: cliEnv(configDirectory),
    });
    expect(unset.stderr).not.toContain('sends your stored API key');
  });
});
