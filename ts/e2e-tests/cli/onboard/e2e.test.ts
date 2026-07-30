/**
 * CLI onboard command e2e tests.
 *
 * Pins the agent-facing JSON contract against the real compiled binary rather than a test double.
 * Only the states reachable without live credentials are covered: logged out, the two usage errors,
 * the stdin-closed invocation that must neither hang nor exit silently, and bare `composio`.
 *
 * The one mode that stays a unit test is "stdout is a terminal": capturing stdout to assert on it
 * makes stdout a file, which is the piped column by definition. A container without a pty cannot
 * express that mode at all, so it is covered against the fixed TerminalUI double instead.
 *
 * Every command runs with an isolated HOME so the container's own config cannot leak in.
 */

import { e2e, type E2ETestResult, type E2ETestResultWithFiles } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { beforeAll, describe, expect, it } from 'bun:test';

type OnboardDocument = {
  readonly kind?: string;
  readonly v?: number;
  readonly onboarded?: boolean;
  readonly next_gate?: string | null;
  readonly blocked?: boolean;
  readonly blocked_reason?: string | null;
  readonly next_command?: string | null;
  readonly human_action?: string | null;
  readonly gates?: Record<string, Record<string, unknown>>;
};

/**
 * Parses the WHOLE stream as one JSON value.
 *
 * A line count or a first-object parse both pass for two adjacent documents, which is exactly the
 * regression a leaked delegate write would cause. `JSON.parse` on the entire stream does not.
 */
const soleDocument = (stdout: string): OnboardDocument =>
  JSON.parse(stdout.trim()) as OnboardDocument;

/** A fresh HOME per invocation, so no state carries over between assertions. */
const isolated = (command: string) => `mkdir -p home && HOME="$PWD/home" ${command}`;

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let jsonLoggedOut: E2ETestResultWithFiles<'out.json'>;
    let stdinClosed: E2ETestResultWithFiles<'out.txt'>;
    let stdinClosedJson: E2ETestResultWithFiles<'out.json'>;
    let emptyToolkit: E2ETestResultWithFiles<'out.txt'>;
    let emptyTask: E2ETestResultWithFiles<'out.txt'>;
    let bareComposio: E2ETestResultWithFiles<'out.txt'>;
    let helpResult: E2ETestResult;

    beforeAll(async () => {
      jsonLoggedOut = await runCmd({
        command: isolated('composio onboard --json > out.json'),
        files: ['out.json'],
      });

      // stdin closed and stdout captured (so this is the piped column): the document must land on
      // stdout, and the human renderer must still have something to say on stderr.
      stdinClosed = await runCmd({
        command: isolated('composio onboard < /dev/null > out.txt'),
        files: ['out.txt'],
      });

      stdinClosedJson = await runCmd({
        command: isolated('composio onboard --json < /dev/null > out.json'),
        files: ['out.json'],
      });

      emptyToolkit = await runCmd({
        command: isolated('composio onboard --toolkit "" --json > out.txt'),
        files: ['out.txt'],
      });

      emptyTask = await runCmd({
        command: isolated('composio onboard --task "" --json > out.txt'),
        files: ['out.txt'],
      });

      // An unroutable base URL with a short timeout: a network attempt would stall or error, so a
      // clean fast exit is the evidence that the nudge is purely local.
      bareComposio = await runCmd({
        command: isolated(
          'COMPOSIO_BASE_URL=http://127.0.0.1:9 timeout 20 composio > out.txt 2> err.txt; echo "exit=$?" >> out.txt; cat err.txt >> out.txt'
        ),
        files: ['out.txt'],
      });

      helpResult = await runCmd(isolated('composio onboard --help'));
    }, TIMEOUTS.FIXTURE);

    describe('composio onboard --json while logged out', () => {
      it('exits zero', () => {
        expect(jsonLoggedOut.exitCode).toBe(0);
      });

      it('emits a parseable, versioned document that resumes at login', () => {
        const document = soleDocument(jsonLoggedOut.files['out.json']);

        expect(document.kind).toBe('onboard_state');
        expect(document.v).toBe(2);
        expect(document.next_gate).toBe('login');
        expect(document.onboarded).toBe(false);
      });

      it('puts kind and v first, so a reader can switch before parsing the rest', () => {
        const keys = Object.keys(
          JSON.parse(jsonLoggedOut.files['out.json'].trim()) as Record<string, unknown>
        );

        expect(keys.slice(0, 2)).toEqual(['kind', 'v']);
      });

      it('stdout carries exactly one JSON value', () => {
        // JSON.parse over the whole stream throws on a second adjacent object.
        expect(() => soleDocument(jsonLoggedOut.files['out.json'])).not.toThrow();
      });

      it('keeps decoration off the data stream', () => {
        expect(jsonLoggedOut.files['out.json']).not.toContain('Step 1/3');
      });
    });

    describe('composio onboard with stdin closed', () => {
      it('does not hang and exits zero', () => {
        expect(stdinClosed.exitCode).toBe(0);
      });

      it('is never silent on every stream at once', () => {
        // stderr is captured here, so decoration is correctly suppressed — `canDecorate` is
        // `stderr.isTTY`. What must not happen is silence everywhere, and the document on stdout is
        // what rules that out. The stderr-speaks half needs a pty and lives in the unit suite.
        expect(soleDocument(stdinClosed.files['out.txt']).kind).toBe('onboard_state');
      });

      it('emits the same document with --json', () => {
        expect(stdinClosedJson.exitCode).toBe(0);
        expect(soleDocument(stdinClosedJson.files['out.json']).kind).toBe('onboard_state');
      });
    });

    describe('usage errors', () => {
      it('--toolkit "" exits non-zero and writes nothing to stdout', () => {
        expect(emptyToolkit.exitCode).not.toBe(0);
        expect(emptyToolkit.files['out.txt'].trim()).toBe('');
      });

      it('--toolkit "" explains what was wrong', () => {
        expect(emptyToolkit.stderr).toContain('--toolkit');
      });

      it('--task "" exits non-zero and writes nothing to stdout', () => {
        expect(emptyTask.exitCode).not.toBe(0);
        expect(emptyTask.files['out.txt'].trim()).toBe('');
      });
    });

    describe('bare composio with an unfinished onboarding', () => {
      it('prints the nudge on stderr with an empty stdout and no network call', () => {
        const captured = bareComposio.files['out.txt'];
        const [stdoutPortion = '', ...rest] = captured.split('exit=');

        // stdout (everything before the `exit=` marker) carries no prose...
        expect(stdoutPortion.trim()).toBe('');
        // ...and the appended stderr carries the nudge, even though stderr is captured.
        expect(rest.join('exit=')).toContain('composio onboard');
        // `timeout 20` would have produced exit 124 had the command tried to reach the API.
        expect(captured).toContain('exit=0');
      });
    });

    describe('composio onboard --help', () => {
      it('documents the agent-facing flags', () => {
        expect(helpResult.exitCode).toBe(0);
        const output = `${helpResult.stdout}${helpResult.stderr}`;
        expect(output).toContain('--json');
        expect(output).toContain('--status');
        expect(output).toContain('--toolkit');
      });
    });
  },
});
