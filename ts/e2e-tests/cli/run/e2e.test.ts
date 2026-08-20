/**
 * CLI run command e2e test
 *
 * `composio run` spawns the user's script as a child process and forwards its exit
 * status to the caller. The forwarding path is process-level: the command handler sets
 * `process.exitCode` and returns a *successful* Effect, and the CLI teardown hands that
 * code to `runMain`, which force-exits only for a non-zero code. Nothing in-process can
 * observe whether that hand-off actually reached the OS, so a `wait`/`$?` assertion
 * against the real binary is the only guard against a failing script silently becoming
 * exit 0.
 *
 * The same applies to the `RUN_LOG_FILE=` path announced on stderr: it is only useful if
 * the file outlives the process that printed it, which cannot be checked from inside the
 * run.
 */

import { e2e, sanitizeOutput, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

/** Marker printed by the successful inline script, unique enough to grep for. */
const STDOUT_MARKER = 'composio-run-e2e-stdout-marker';

/**
 * Runs a successful script, then — after the CLI process has exited — reports whether the
 * `RUN_LOG_FILE=` path it advertised on stderr still exists. Probe results go to stdout as
 * `KEY=value` lines; the CLI's own stderr is parked in a file so it cannot mix in.
 */
const runLogProbeCommand = [
  `composio run 'console.log("run-log-probe")' 2> run-stderr.txt`,
  'run_status=$?',
  `run_log_path=$(grep '^RUN_LOG_FILE=' run-stderr.txt | head -n 1 | cut -d= -f2-)`,
  'echo "RUN_STATUS=$run_status"',
  'if [ -n "$run_log_path" ]; then echo "RUN_LOG_ANNOUNCED=yes"; else echo "RUN_LOG_ANNOUNCED=no"; fi',
  'if [ -f "$run_log_path" ]; then echo "RUN_LOG_EXISTS=yes"; else echo "RUN_LOG_EXISTS=no"; fi',
].join('; ');

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let failingScriptResult: E2ETestResult;
    let successfulScriptResult: E2ETestResult;
    let missingScriptResult: E2ETestResult;
    let runLogResult: E2ETestResult;

    beforeAll(async () => {
      failingScriptResult = await runCmd(`composio run 'process.exit(7)'`);
      successfulScriptResult = await runCmd(`composio run 'console.log("${STDOUT_MARKER}")'`);
      missingScriptResult = await runCmd('composio run');
      runLogResult = await runCmd(runLogProbeCommand);
    }, TIMEOUTS.FIXTURE);

    describe('composio run with a failing script', () => {
      it('forwards the script exit status to the caller', () => {
        expect(failingScriptResult.exitCode).toBe(7);
      });
    });

    describe('composio run with a successful script', () => {
      it('exits successfully', () => {
        expect(successfulScriptResult.exitCode).toBe(0);
      });

      it('forwards script stdout to the caller', () => {
        expect(sanitizeOutput(successfulScriptResult.stdout)).toContain(STDOUT_MARKER);
      });
    });

    describe('composio run without inline code or --file', () => {
      it('exits non-zero', () => {
        expect(missingScriptResult.exitCode).not.toBe(0);
      });

      it('explains what is missing on stderr', () => {
        expect(sanitizeOutput(missingScriptResult.stderr)).toContain(
          'Provide inline code or use --file to run a script file.'
        );
      });

      it('writes no data to stdout', () => {
        expect(sanitizeOutput(missingScriptResult.stdout)).toBe('');
      });
    });

    describe('the RUN_LOG_FILE path announced on stderr', () => {
      it('is announced', () => {
        expect(runLogResult.exitCode).toBe(0);
        expect(sanitizeOutput(runLogResult.stdout)).toContain('RUN_STATUS=0');
        expect(sanitizeOutput(runLogResult.stdout)).toContain('RUN_LOG_ANNOUNCED=yes');
      });

      it('still exists after the CLI process exits', () => {
        expect(sanitizeOutput(runLogResult.stdout)).toContain('RUN_LOG_EXISTS=yes');
      });
    });
  },
});
