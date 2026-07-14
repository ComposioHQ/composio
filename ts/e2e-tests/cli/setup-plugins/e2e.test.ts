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
    ? `mkdir -p /tmp/.claude/skills /tmp/.agents/skills/composio-cli
printf '%s\n' '# composio-cli' > /tmp/.agents/skills/composio-cli/SKILL.md
printf '@composio/cli@%s\n' "$(composio --version)" > /tmp/.agents/skills/composio-cli/.composio-release-tag
ln -s ../../.agents/skills/composio-cli /tmp/.claude/skills/composio-cli`
    : ''
}
export HOST_STATE_DIR=/tmp/host-state
export PATH=/tmp/bin:$PATH
composio setup --target ${host} --yes
composio setup --target ${host} --yes
${
  host === 'claude'
    ? `test -L /tmp/.claude/skills/composio-cli
test -r /tmp/.claude/skills/composio-cli/SKILL.md`
    : ''
}
cp /tmp/host-state/commands.log commands.log
`;

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let claude: E2ETestResultWithFiles<'commands.log'>;
    let codex: E2ETestResultWithFiles<'commands.log'>;
    let unavailable: E2ETestResult;

    beforeAll(async () => {
      // The shared E2E runner derives container names from Date.now(), so keep
      // these fresh-container cases sequential to avoid same-millisecond names.
      claude = await runCmd({
        command: setupFixture('claude'),
        files: ['commands.log'],
      });
      codex = await runCmd({
        command: setupFixture('codex'),
        files: ['commands.log'],
      });
      unavailable = await runCmd('composio setup --target auto --yes');
    }, TIMEOUTS.FIXTURE);

    describe.each([
      {
        host: 'claude' as const,
        result: () => claude,
        marketplaceCommand:
          'claude plugin marketplace add https://github.com/ComposioHQ/composio-plugin-cc.git --scope user',
        installCommand: 'claude plugin install composio@composio --scope user',
      },
      {
        host: 'codex' as const,
        result: () => codex,
        marketplaceCommand:
          'codex plugin marketplace add https://github.com/ComposioHQ/composio-plugin-openai.git --json',
        installCommand: 'codex plugin add composio@composio --json',
      },
    ])('$host setup', ({ result, marketplaceCommand, installCommand }) => {
      it('installs once and is idempotent', () => {
        const execution = result();
        expect(execution.exitCode).toBe(0);
        expect(execution.stdout).toBe('');
        expect(execution.stderr).toBe('');

        const commands = execution.files['commands.log'].trim().split('\n');
        expect(commands.filter(command => command === marketplaceCommand)).toHaveLength(1);
        expect(commands.filter(command => command === installCommand)).toHaveLength(1);
      });
    });

    describe('automatic host detection', () => {
      it('fails clearly when neither supported host is installed', () => {
        expect(unavailable.exitCode).not.toBe(0);
        expect(unavailable.stdout).toBe('');
        expect(unavailable.stderr).toContain('No supported agent host was detected');
      });
    });
  },
});
