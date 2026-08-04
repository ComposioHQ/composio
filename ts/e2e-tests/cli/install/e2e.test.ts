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
  // The test scripts are POSIX sh, which fish cannot interpret: drive fish legs
  // from bash and let the assertions invoke fish login shells explicitly.
  const scriptShell = config.shell === 'fish' ? 'bash' : config.shell;
  return runInstallContainer({
    ...image,
    shell: config.shell,
    cmd: [scriptShell, '-lc', script],
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

if (config.mode === 'local' && config.shell === 'fish') {
  describe('local fish installation', () => {
    it(
      'configures fish idempotently and exposes composio in a fresh fish login shell',
      async () => {
        const result = await run(`
set -eu
test ! -d "$HOME/.local/bin"
curl -fsSL "$INSTALL_BASE_URL/install/fish" | sh
curl -fsSL "$INSTALL_BASE_URL/install/fish" | sh
test -x "$HOME/.composio/composio"
test -L "$HOME/.local/bin/composio"
test "$(readlink -f "$HOME/.local/bin/composio")" = "$HOME/.composio/composio"
test "$(grep -Fc '# Composio CLI' "$HOME/.config/fish/config.fish")" = 1
test "$(fish -l -c 'command -v composio')" = "$HOME/.local/bin/composio"
test "$(fish -l -c 'composio --version')" = 98.0.0
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
      'rejects an archive that fails checksum verification before extraction',
      async () => {
        const result = await run(`
set -eu
if output=$(curl -fsSL "$INSTALL_BASE_URL/install" | COMPOSIO_GITHUB_URL="$INSTALL_BASE_URL/checksum-mismatch" sh -s -- "$E2E_RELEASE_TAG" 2>&1); then
  echo 'mismatched archive unexpectedly installed' >&2
  exit 1
fi
printf '%s\n' "$output" | grep -F 'Checksum mismatch'
test ! -e "$HOME/.local/bin/composio"
`);
        assertSuccess(result);
      },
      timeout
    );

    it(
      'rejects a corrupted archive at extraction before creating the entry point',
      async () => {
        const result = await run(`
set -eu
if output=$(curl -fsSL "$INSTALL_BASE_URL/install" | COMPOSIO_GITHUB_URL="$INSTALL_BASE_URL/corrupt" sh -s -- "$E2E_RELEASE_TAG" 2>&1); then
  echo 'corrupted archive unexpectedly installed' >&2
  exit 1
fi
printf '%s\n' "$output" | grep -F 'Checksum verified'
printf '%s\n' "$output" | grep -F 'Failed to extract archive'
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
        // The /install/<shell> variant routes are not provisioned in production
        // yet (404); select the shell through COMPOSIO_INSTALL_SHELL on the base
        // route until they ship.
        const loginShell = (script: string) =>
          config.shell === 'fish' ? `fish -l -c '${script}'` : `${config.shell} -ilc '${script}'`;
        const result = await run(`
set -eu
test ! -d "$HOME/.local/bin"
curl -fsSL "$INSTALL_BASE_URL/install" | COMPOSIO_INSTALL_SHELL=${config.shell} SHELL=/bin/${config.shell} sh
test -x "$HOME/.composio/composio"
test -L "$HOME/.local/bin/composio"
test "$(${loginShell('command -v composio')})" = "$HOME/.local/bin/composio"
${loginShell('composio --version')}
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
curl -fsSL "$INSTALL_BASE_URL/install" | COMPOSIO_INSTALL_SHELL=${config.shell} sh -s -- "$E2E_VERSION"
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
