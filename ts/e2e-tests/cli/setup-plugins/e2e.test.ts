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
composio setup --uninstall --target ${host} --yes
composio setup --uninstall --target ${host} --yes
${
  host === 'claude'
    ? `test ! -L /tmp/.claude/skills/composio-cli
test ! -e /tmp/.agents/skills/composio-cli`
    : ''
}
cp /tmp/host-state/commands.log second-run.log
`;

const legacyCodexFixture = `
set -eu
mkdir -p /tmp/bin /tmp/host-state
cp fixtures/fake-agent-host.sh /tmp/bin/codex
chmod +x /tmp/bin/codex
touch /tmp/host-state/codex-without-json
export HOST_STATE_DIR=/tmp/host-state
export PATH=/tmp/bin:$PATH
composio setup --target auto --yes
`;

const legacyCodexIfPresentFixture = legacyCodexFixture.replace(
  'composio setup --target auto --yes',
  'composio setup --target auto --yes --if-present'
);

const legacyClaudeFixture = `
set -eu
mkdir -p /tmp/bin /tmp/host-state
cp fixtures/fake-agent-host.sh /tmp/bin/claude
chmod +x /tmp/bin/claude
touch /tmp/host-state/claude-without-json
export HOST_STATE_DIR=/tmp/host-state
export PATH=/tmp/bin:$PATH
composio setup --target auto --yes
`;

const claudeWithLegacyCodexFixture = `
set -eu
mkdir -p /tmp/bin /tmp/host-state
cp fixtures/fake-agent-host.sh /tmp/bin/claude
cp fixtures/fake-agent-host.sh /tmp/bin/codex
chmod +x /tmp/bin/claude /tmp/bin/codex
touch /tmp/host-state/codex-without-json
mkdir -p /tmp/.claude/skills /tmp/.agents/skills/composio-cli
printf '%s\n' '# composio-cli' > /tmp/.agents/skills/composio-cli/SKILL.md
printf '@composio/cli@%s\n' "$(composio --version)" > /tmp/.agents/skills/composio-cli/.composio-release-tag
ln -s ../../.agents/skills/composio-cli /tmp/.claude/skills/composio-cli
export HOST_STATE_DIR=/tmp/host-state
export PATH=/tmp/bin:$PATH
composio setup --target auto --yes
test -f /tmp/host-state/claude-plugin
test ! -f /tmp/host-state/codex-plugin
`;

const codexWithLegacyClaudeFixture = `
set -eu
mkdir -p /tmp/bin /tmp/host-state
cp fixtures/fake-agent-host.sh /tmp/bin/claude
cp fixtures/fake-agent-host.sh /tmp/bin/codex
chmod +x /tmp/bin/claude /tmp/bin/codex
touch /tmp/host-state/claude-without-json
export HOST_STATE_DIR=/tmp/host-state
export PATH=/tmp/bin:$PATH
composio setup --target auto --yes
test ! -f /tmp/host-state/claude-plugin
test -f /tmp/host-state/codex-plugin
`;

const failedClaudeInspectionFixture = `
set -eu
mkdir -p /tmp/bin /tmp/host-state
cp fixtures/fake-agent-host.sh /tmp/bin/claude
chmod +x /tmp/bin/claude
touch /tmp/host-state/claude-inspection-fails
export HOST_STATE_DIR=/tmp/host-state
export PATH=/tmp/bin:$PATH
composio setup --target auto --yes
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
    let skippedUnavailableUninstall: E2ETestResult;
    let legacyClaude: E2ETestResult;
    let legacyCodex: E2ETestResult;
    let legacyCodexIfPresent: E2ETestResult;
    let claudeWithLegacyCodex: E2ETestResult;
    let codexWithLegacyClaude: E2ETestResult;
    let failedClaudeInspection: E2ETestResult;

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
      skippedUnavailableUninstall = await runCmd(
        'composio setup --uninstall --target auto --yes --if-present'
      );
      legacyClaude = await runCmd(legacyClaudeFixture);
      legacyCodex = await runCmd(legacyCodexFixture);
      legacyCodexIfPresent = await runCmd(legacyCodexIfPresentFixture);
      claudeWithLegacyCodex = await runCmd(claudeWithLegacyCodexFixture);
      codexWithLegacyClaude = await runCmd(codexWithLegacyClaudeFixture);
      failedClaudeInspection = await runCmd(failedClaudeInspectionFixture);
    }, TIMEOUTS.FIXTURE);

    describe.each([
      {
        host: 'claude' as const,
        result: () => claude,
        marketplaceCommand:
          'claude plugin marketplace add https://github.com/ComposioHQ/composio-plugin-cc.git --scope user',
        installCommand: 'claude plugin install composio@composio --scope user',
        additionalMutationCommands: ['claude plugin enable composio@composio --scope user'],
        uninstallCommand: 'claude plugin uninstall composio@composio --scope user --yes',
      },
      {
        host: 'codex' as const,
        result: () => codex,
        marketplaceCommand:
          'codex plugin marketplace add https://github.com/ComposioHQ/composio-plugin-openai.git --json',
        installCommand: 'codex plugin add composio@composio --json',
        additionalMutationCommands: [],
        uninstallCommand: 'codex plugin remove composio@composio --json',
      },
    ])(
      '$host setup',
      ({
        result,
        marketplaceCommand,
        installCommand,
        additionalMutationCommands,
        uninstallCommand,
      }) => {
        it('installs once and uninstalls once with idempotent reruns', () => {
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
          expect(secondRunCommands.filter(command => command === uninstallCommand)).toHaveLength(1);
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

      it('can skip uninstall cleanly when no host is present', () => {
        expect(skippedUnavailableUninstall.exitCode).toBe(0);
        expect(skippedUnavailableUninstall.stdout).toBe('');
        expect(skippedUnavailableUninstall.stderr).toBe('');
      });
    });

    describe('agent compatibility', () => {
      it('exits with Claude update instructions when no supported host remains', () => {
        expect(legacyClaude.exitCode).not.toBe(0);
        expect(legacyClaude.stdout).toBe('');
        expect(legacyClaude.stderr).toContain('requires JSON plugin inspection');
        expect(legacyClaude.stderr).toContain('claude update');
      });

      it('exits with upgrade instructions when no supported host remains', () => {
        expect(legacyCodex.exitCode).not.toBe(0);
        expect(legacyCodex.stdout).toBe('');
        expect(legacyCodex.stderr).toContain('requires Codex 0.139.0 or newer');
        expect(legacyCodex.stderr).toContain('codex update');
        expect(legacyCodex.stderr).not.toContain("unexpected argument '--json'");
      });

      it('skips an unsupported-only host when invoked by an installer', () => {
        expect(legacyCodexIfPresent.exitCode).toBe(0);
        expect(legacyCodexIfPresent.stdout).toBe('');
        expect(legacyCodexIfPresent.stderr).toBe('');
      });

      it('continues with Claude when Codex is unsupported', () => {
        expect(claudeWithLegacyCodex.exitCode).toBe(0);
        expect(claudeWithLegacyCodex.stdout).toBe('');
        expect(claudeWithLegacyCodex.stderr).toBe('');
      });

      it('continues with Codex when Claude is unsupported', () => {
        expect(codexWithLegacyClaude.exitCode).toBe(0);
        expect(codexWithLegacyClaude.stdout).toBe('');
        expect(codexWithLegacyClaude.stderr).toBe('');
      });
    });

    describe('graceful failures', () => {
      it('reports the failed host, recovery command, and no generic usage dump', () => {
        expect(failedClaudeInspection.exitCode).not.toBe(0);
        expect(failedClaudeInspection.stdout).toBe('');
        expect(failedClaudeInspection.stderr).toContain('Composio setup was unsuccessful.');
        expect(failedClaudeInspection.stderr).toContain(
          'Failed to inspect Claude Code plugins: native inspection failed.'
        );
        expect(failedClaudeInspection.stderr).toContain('composio setup --target claude');
        expect(failedClaudeInspection.stderr).not.toContain('USAGE');
        expect(failedClaudeInspection.stderr).not.toContain('effect-errors');
      });
    });
  },
});
