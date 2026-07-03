import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { beforeAll, describe, expect, it } from 'bun:test';

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let helpResult: E2ETestResult;
    let nonInteractiveResult: E2ETestResult;
    let invalidTargetResult: E2ETestResult;

    beforeAll(async () => {
      helpResult = await runCmd('composio onboard --help');
      nonInteractiveResult = await runCmd(
        'mkdir -p /tmp/.cursor && COMPOSIO_USER_API_KEY=uak_test composio onboard --yes --no-skill-install --targets cursor'
      );
      invalidTargetResult = await runCmd(
        'COMPOSIO_USER_API_KEY=uak_test composio onboard --yes --no-skill-install --targets zed'
      );
    }, TIMEOUTS.FIXTURE);

    describe('composio onboard', () => {
      it('is included in the compiled binary with its public options', () => {
        expect(helpResult.exitCode).toBe(0);
        expect(helpResult.stdout).toContain('--targets');
        expect(helpResult.stdout).toContain('--no-skill-install');
        expect(helpResult.stdout).toContain('--yes');
      });

      it('runs non-interactively for a detected target without contacting login services', () => {
        expect(nonInteractiveResult.exitCode).toBe(0);
        expect(nonInteractiveResult.stdout).toBe('');
        expect(nonInteractiveResult.stderr).toBe('');
      });

      it('rejects unsupported targets before onboarding starts', () => {
        expect(invalidTargetResult.exitCode).not.toBe(0);
        const output = `${invalidTargetResult.stdout}\n${invalidTargetResult.stderr}`;
        expect(output).toContain('Unsupported onboarding target');
        expect(output).toContain('zed');
      });
    });
  },
});
