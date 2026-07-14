/**
 * CLI plugin setup end-to-end tests.
 *
 * Runs the compiled standalone binary with HOME=/tmp in fresh Debian
 * containers. The host executables implement the native Claude Code and Codex
 * JSON contracts while recording every command for exact invocation checks.
 */

import { e2e, type E2ETestResult, type E2ETestResultWithFiles } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { beforeAll, describe, expect, it } from 'bun:test';

const setupFixture = (host: 'claude' | 'codex') => `
set -eu
mkdir -p /tmp/bin /tmp/host-state
cp fixtures/fake-agent-host.sh /tmp/bin/${host}
chmod +x /tmp/bin/${host}
${
  host === 'claude'
    ? `# Keep this suite focused on packaged plugin orchestration. The standalone
# skill asset download and extraction path has deterministic HTTP/ZIP coverage.
mkdir -p /tmp/.claude/skills /tmp/.agents/skills/composio-cli
printf '%s\n' '# composio-cli' > /tmp/.agents/skills/composio-cli/SKILL.md
printf '@composio/cli@%s\n' "$(composio --version)" > /tmp/.agents/skills/composio-cli/.composio-release-tag
ln -s ../../.agents/skills/composio-cli /tmp/.claude/skills/composio-cli`
    : ''
}
export HOST_STATE_DIR=/tmp/host-state
export PATH=/tmp/bin:$PATH
composio setup --target ${host} --yes
cp /tmp/host-state/commands.log first-run.log
: > /tmp/host-state/commands.log
composio setup --target ${host} --yes
${
  host === 'claude'
    ? `test -L /tmp/.claude/skills/composio-cli
test -r /tmp/.claude/skills/composio-cli/SKILL.md`
    : ''
}
cp /tmp/host-state/commands.log second-run.log
`;

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let claude: E2ETestResultWithFiles<'first-run.log' | 'second-run.log'>;
    let codex: E2ETestResultWithFiles<'first-run.log' | 'second-run.log'>;
    let unavailable: E2ETestResult;
    let skippedUnavailable: E2ETestResult;

    beforeAll(async () => {
      // The shared E2E runner derives container names from Date.now(), so keep
      // these fresh-container cases sequential to avoid same-millisecond names.
      claude = await runCmd({
        command: setupFixture('claude'),
        files: ['first-run.log', 'second-run.log'],
      });
      codex = await runCmd({
        command: setupFixture('codex'),
        files: ['first-run.log', 'second-run.log'],
      });
      unavailable = await runCmd('composio setup --target auto --yes');
      skippedUnavailable = await runCmd('composio setup --target auto --yes --if-present');
    }, TIMEOUTS.FIXTURE);

    describe.each([
      {
        host: 'claude' as const,
        result: () => claude,
        marketplaceCommand:
          'claude plugin marketplace add https://github.com/ComposioHQ/composio-plugin-cc.git --scope user',
        installCommand: 'claude plugin install composio@composio --scope user',
        additionalMutationCommands: ['claude plugin enable composio@composio --scope user'],
      },
      {
        host: 'codex' as const,
        result: () => codex,
        marketplaceCommand:
          'codex plugin marketplace add https://github.com/ComposioHQ/composio-plugin-openai.git --json',
        installCommand: 'codex plugin add composio@composio --json',
        additionalMutationCommands: [],
      },
    ])(
      '$host setup',
      ({ result, marketplaceCommand, installCommand, additionalMutationCommands }) => {
        it('configures the plugin on the first run and is idempotent', () => {
          const execution = result();
          expect(execution.exitCode).toBe(0);
          expect(execution.stdout).toBe('');
          expect(execution.stderr).toBe('');

          const firstRunCommands = execution.files['first-run.log'].trim().split('\n');
          expect(firstRunCommands.filter(command => command === marketplaceCommand)).toHaveLength(
            1
          );
          expect(firstRunCommands.filter(command => command === installCommand)).toHaveLength(1);

          const secondRunCommands = execution.files['second-run.log'].trim().split('\n');
          const mutationCommands = [
            marketplaceCommand,
            installCommand,
            ...additionalMutationCommands,
          ];
          expect(
            secondRunCommands.filter(command =>
              mutationCommands.some(mutation => mutation === command)
            )
          ).toEqual([]);
        });
      }
    );

    describe('automatic host detection', () => {
      it('fails clearly when neither supported host is installed', () => {
        expect(unavailable.exitCode).not.toBe(0);
        expect(unavailable.stdout).toBe('');
        expect(unavailable.stderr).toContain('No supported agent host was detected');
      });

      it('can skip cleanly when invoked by an installer', () => {
        expect(skippedUnavailable.exitCode).toBe(0);
        expect(skippedUnavailable.stdout).toBe('');
        expect(skippedUnavailable.stderr).toBe('');
      });
    });
  },
});
