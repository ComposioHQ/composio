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
 * Every command runs with an isolated HOME so the container's own config cannot leak in, and with
 * `COMPOSIO_BASE_URL` pinned at a mock server — the logged-out path advances the login gate, so it
 * makes a real API call, and the mock is what keeps CI off production and lets the suite observe
 * that the call happened at all.
 */

import { e2e, type E2ETestResultWithFiles } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  startMockAgentsServer,
  type MockAgentsServer,
} from '../../../packages/cli/scripts/mock-agents-server';

type OnboardDocument = {
  readonly kind?: string;
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

/**
 * A fresh HOME per invocation, so no state carries over between assertions, and a base URL pinned
 * at the harness mock server.
 *
 * Pinning is not tidiness. `composio onboard --json` while logged out advances the login gate, so
 * it reaches `client.createSession` — against the production API if nothing says otherwise, minting
 * a real CLI login session from CI on every run. And because the login delegate's failure is
 * swallowed, every assertion below holds whether the call succeeded, 404'd, or never connected.
 */
const isolated = (server: MockAgentsServer, command: string) =>
  `mkdir -p home && HOME="$PWD/home" COMPOSIO_BASE_URL=${server.dockerBaseUrl} ${command}`;

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let apiServer: MockAgentsServer;
    /** A listener nothing is supposed to reach: the bare-`composio` nudge must be purely local. */
    let silentServer: MockAgentsServer;
    let jsonLoggedOut: E2ETestResultWithFiles<'out.json'>;
    let stdinClosed: E2ETestResultWithFiles<'out.txt'>;
    let stdinClosedJson: E2ETestResultWithFiles<'out.json'>;
    let emptyToolkit: E2ETestResultWithFiles<'out.txt'>;
    let injectedToolkit: E2ETestResultWithFiles<'out.txt'>;
    let emptyTask: E2ETestResultWithFiles<'out.txt'>;
    let bareComposio: E2ETestResultWithFiles<'out.txt'>;

    beforeAll(async () => {
      apiServer = await startMockAgentsServer();
      silentServer = await startMockAgentsServer();

      jsonLoggedOut = await runCmd({
        command: isolated(apiServer, 'composio onboard --json > out.json'),
        files: ['out.json'],
      });

      // stdin closed and stdout captured (so this is the piped column): the document must land on
      // stdout, and the human renderer must still have something to say on stderr.
      stdinClosed = await runCmd({
        command: isolated(apiServer, 'composio onboard < /dev/null > out.txt'),
        files: ['out.txt'],
      });

      stdinClosedJson = await runCmd({
        command: isolated(apiServer, 'composio onboard --json < /dev/null > out.json'),
        files: ['out.json'],
      });

      emptyToolkit = await runCmd({
        command: isolated(apiServer, 'composio onboard --toolkit "" --json > out.txt'),
        files: ['out.txt'],
      });

      // The emitted `next_command` and `human_action` are strings callers exec, so a value carrying
      // shell metacharacters has to be refused at the flag rather than quoted at the sink.
      injectedToolkit = await runCmd({
        command: isolated(
          apiServer,
          `composio onboard --toolkit 'github; echo pwned' --json > out.txt 2>&1 || true`
        ),
        files: ['out.txt'],
      });

      emptyTask = await runCmd({
        command: isolated(apiServer, 'composio onboard --task "" --json > out.txt'),
        files: ['out.txt'],
      });

      // A reachable, instrumented listener rather than a closed port. A closed port refuses
      // instantly, so a regression that performs the request and swallows the connection error
      // still exits 0 and prints the same nudge — the assertion that catches it is the request
      // count, which is why the base URL points somewhere that can actually record one. Telemetry
      // is disabled explicitly so the counter observes the nudge path and nothing else.
      bareComposio = await runCmd({
        command: isolated(
          silentServer,
          'COMPOSIO_CLI_TELEMETRY_DISABLED=1 timeout 20 composio > out.txt 2> err.txt; echo "exit=$?" >> out.txt; cat err.txt >> out.txt'
        ),
        files: ['out.txt'],
      });
    }, TIMEOUTS.FIXTURE);

    afterAll(async () => {
      await apiServer.close();
      await silentServer.close();
    });

    describe('composio onboard --json while logged out', () => {
      it('exits zero', () => {
        expect(jsonLoggedOut.exitCode).toBe(0);
      });

      it('emits a parseable document that resumes at login', () => {
        // `soleDocument` parses the whole stream, so a second adjacent JSON value throws here.
        const document = soleDocument(jsonLoggedOut.files['out.json']);

        expect(document.kind).toBe('onboard_state');
        expect(document.next_gate).toBe('login');
        expect(document.onboarded).toBe(false);
      });

      it('actually minted a session rather than degrading to the same document', () => {
        // Every assertion above holds for a login delegate that failed, because the failure is
        // swallowed by design. These two do not: the URL and the `--poll` command are reachable
        // only from a `pending` outcome, which requires the create-session call to have succeeded.
        expect(apiServer.requests).toContain('POST /api/v3.1/cli/create-session');

        const document = soleDocument(jsonLoggedOut.files['out.json']);
        expect(document.human_action).toContain('cliKey=');
        expect(document.next_command).toBe('composio login --poll');
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

      it('--toolkit with shell metacharacters is rejected and never emitted', () => {
        const captured = injectedToolkit.files['out.txt'];

        expect(captured).not.toContain('pwned');
        expect(captured).not.toContain('onboard_state');
        expect(captured).toContain('--toolkit');
      });

      it('--task "" exits non-zero and writes nothing to stdout', () => {
        expect(emptyTask.exitCode).not.toBe(0);
        expect(emptyTask.files['out.txt'].trim()).toBe('');
      });
    });

    describe('bare composio with an unfinished onboarding', () => {
      it('prints the nudge on stderr with an empty stdout', () => {
        const captured = bareComposio.files['out.txt'];
        const [stdoutPortion = '', ...rest] = captured.split('exit=');

        // stdout (everything before the `exit=` marker) carries no prose...
        expect(stdoutPortion.trim()).toBe('');
        // ...and the appended stderr carries the nudge, even though stderr is captured.
        expect(rest.join('exit=')).toContain('composio onboard');
        expect(captured).toContain('exit=0');
      });

      it('makes no API request at all', () => {
        // The instrumented listener is the evidence. Exit code and output are not: a regression
        // that performs the request and catches the error reproduces both exactly.
        expect(silentServer.requests).toEqual([]);
      });
    });
  },
});
