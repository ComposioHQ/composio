import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  checkDocker,
  ensureInstallImage,
  resolveInstallE2EConfig,
  runInstallContainer,
  type ExecResult,
  type InstallImage,
} from '@e2e-tests/utils';
import { INSTALL_E2E_LOCAL_RELEASE_TAG } from '@e2e-tests/utils/const';
import { startInstallReleaseServer, type InstallReleaseServer } from './release-server';

const config = resolveInstallE2EConfig();
const repoRoot = resolve(import.meta.dir, '../../../..');
const timeout = 600_000;

let image: InstallImage | undefined;
let releaseServer: InstallReleaseServer | undefined;

function assertSuccess(result: ExecResult): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `Install container exited ${result.exitCode}\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`
    );
  }
  expect(result.exitCode).toBe(0);
}

function installerEnvironment(): Record<string, string> {
  if (config.mode === 'prod') {
    return {
      INSTALL_BASE_URL: 'https://composio.dev',
      E2E_VERSION: config.version,
    };
  }

  if (!releaseServer) {
    throw new Error('Local release server is not running');
  }

  return {
    INSTALL_BASE_URL: releaseServer.baseUrl,
    E2E_RELEASE_TAG: INSTALL_E2E_LOCAL_RELEASE_TAG,
    COMPOSIO_GITHUB_URL: releaseServer.baseUrl,
    COMPOSIO_GITHUB_API_BASE_URL: releaseServer.baseUrl,
    COMPOSIO_INSTALL_SCRIPT_URL: `${releaseServer.baseUrl}/install`,
    COMPOSIO_INSTALL_ALLOW_HTTP_HOST: 'host.docker.internal',
  };
}

async function run(script: string): Promise<ExecResult> {
  if (!image) {
    throw new Error('Install image is not ready');
  }
  return runInstallContainer({
    ...image,
    shell: config.shell,
    cmd: [config.shell, '-lc', script],
    env: installerEnvironment(),
  });
}

beforeAll(async () => {
  const docker = await checkDocker({ repoRoot });
  if (docker.exitCode !== 0) {
    throw new Error(`Docker is required for install e2e tests: ${docker.stderr || docker.stdout}`);
  }

  if (config.mode === 'local') {
    releaseServer = startInstallReleaseServer({
      repoRoot,
      releaseDir: config.releaseDir!,
    });
  }
  image = await ensureInstallImage(config.shell, {
    repoRoot,
    platform: releaseServer?.platform,
  });
}, timeout);

afterAll(() => {
  releaseServer?.stop();
});

if (config.mode === 'local' && config.shell === 'bash') {
  describe('local bash installation', () => {
    it(
      'installs into a virgin home and is available in a fresh login shell',
      async () => {
        const result = await run(`
set -eu
test ! -d "$HOME/.local/bin"
curl -fsSL "$INSTALL_BASE_URL/install" | sh
test -x "$HOME/.composio/composio"
test -L "$HOME/.local/bin/composio"
test "$(readlink -f "$HOME/.local/bin/composio")" = "$HOME/.composio/composio"
test "$(bash -ilc 'command -v composio')" = "$HOME/.local/bin/composio"
test "$(bash -ilc 'composio --version')" = 98.0.0
`);
        assertSuccess(result);
      },
      timeout
    );

    it(
      'configures an existing bash login profile only through the bash variant',
      async () => {
        const result = await run(`
set -eu
printf '%s\n' 'export PROFILE_TRAP=1' > "$HOME/.bash_profile"
output=$(curl -fsSL "$INSTALL_BASE_URL/install" | sh)
printf '%s\n' "$output" | grep -F 'Required next step for bash:'
if bash -ilc 'command -v composio' >/dev/null 2>&1; then
  echo 'default installer unexpectedly configured the login shell' >&2
  exit 1
fi
curl -fsSL "$INSTALL_BASE_URL/install/bash" | sh
test "$(bash -ilc 'command -v composio')" = "$HOME/.local/bin/composio"
test "$(bash -ilc 'composio --version')" = 98.0.0
test "$(grep -Fc '# Composio CLI' "$HOME/.bash_profile")" = 1
test "$(grep -Fc '# Composio CLI' "$HOME/.bashrc")" = 1
`);
        assertSuccess(result);
      },
      timeout
    );

    it(
      'configures bash through COMPOSIO_INSTALL_SHELL idempotently',
      async () => {
        const result = await run(`
set -eu
curl -fsSL "$INSTALL_BASE_URL/install" | COMPOSIO_INSTALL_SHELL=bash sh
curl -fsSL "$INSTALL_BASE_URL/install" | COMPOSIO_INSTALL_SHELL=bash sh
test "$(bash -ilc 'command -v composio')" = "$HOME/.local/bin/composio"
test "$(bash -ilc 'composio --version')" = 98.0.0
test "$(grep -Fc '# Composio CLI' "$HOME/.bashrc")" = 1
`);
        assertSuccess(result);
      },
      timeout
    );
  });
}

if (config.mode === 'local' && config.shell === 'zsh') {
  describe('local zsh installation', () => {
    it(
      'keeps the bundle beside its support files and configures zsh idempotently',
      async () => {
        const result = await run(`
set -eu
test ! -d "$HOME/.local/bin"
curl -fsSL "$INSTALL_BASE_URL/install/zsh" | sh
curl -fsSL "$INSTALL_BASE_URL/install/zsh" | sh
test -x "$HOME/.composio/composio"
test -L "$HOME/.local/bin/composio"
test "$(readlink -f "$HOME/.local/bin/composio")" = "$HOME/.composio/composio"
test "$(cat "$HOME/.composio/release-tag.txt")" = "$E2E_RELEASE_TAG"
test -f "$HOME/.composio/run-helpers-runtime.mjs"
test -d "$HOME/.composio/local-tools-binaries"
test "$(grep -Fc '# Composio CLI' "$HOME/.zshrc")" = 1
test "$(zsh -ilc 'command -v composio')" = "$HOME/.local/bin/composio"
test "$(zsh -ilc 'composio --version')" = 98.0.0
`);
        assertSuccess(result);
      },
      timeout
    );
  });
}

if (config.mode === 'local') {
  describe('local failure handling', () => {
    it(
      'rejects a corrupted release archive before creating the entry point',
      async () => {
        const result = await run(`
set -eu
if curl -fsSL "$INSTALL_BASE_URL/install" | COMPOSIO_GITHUB_URL="$INSTALL_BASE_URL/corrupt" sh -s -- "$E2E_RELEASE_TAG"; then
  echo 'corrupted archive unexpectedly installed' >&2
  exit 1
fi
test ! -e "$HOME/.local/bin/composio"
`);
        assertSuccess(result);
      },
      timeout
    );
  });
}

if (config.mode === 'prod' && config.version === 'latest') {
  describe(`production latest installation on ${config.shell}`, () => {
    it(
      'makes composio available in a fresh login shell',
      async () => {
        const route = config.shell === 'bash' ? 'install' : 'install/zsh';
        const result = await run(`
set -eu
test ! -d "$HOME/.local/bin"
curl -fsSL "$INSTALL_BASE_URL/${route}" | sh
test -x "$HOME/.composio/composio"
test -L "$HOME/.local/bin/composio"
test "$(${config.shell} -ilc 'command -v composio')" = "$HOME/.local/bin/composio"
${config.shell} -ilc 'composio --version'
`);
        assertSuccess(result);
      },
      timeout
    );
  });
}

if (config.mode === 'prod' && config.version !== 'latest') {
  describe(`production ${config.version} compatibility installation`, () => {
    it(
      'uses inline shell setup when the pinned CLI lacks install --shell',
      async () => {
        const result = await run(`
set -eu
curl -fsSL "$INSTALL_BASE_URL/install" | sh -s -- "$E2E_VERSION"
if "$HOME/.composio/composio" install --help | grep -q -- '--shell'; then
  echo 'expected the pinned CLI to predate install --shell' >&2
  exit 1
fi
curl -fsSL "$INSTALL_BASE_URL/install/${config.shell}" | sh -s -- "$E2E_VERSION"
test "$(grep -Fc '# Composio CLI' "$HOME/.zshrc")" = 1
test "$(zsh -ilc 'command -v composio')" = "$HOME/.local/bin/composio"
zsh -ilc 'composio --version'
`);
        assertSuccess(result);
      },
      timeout
    );
  });
}
