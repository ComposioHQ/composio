import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { afterAll, beforeAll, expect, it } from 'bun:test';
import { Schema } from 'effect';
import {
  startMockAgentsServer,
  type MockAgentsServer,
} from '../../../packages/cli/scripts/mock-agents-server';

const OnboardDocument = Schema.Struct({
  kind: Schema.String,
  version: Schema.Number,
  onboarded: Schema.Boolean,
  next_gate: Schema.NullOr(Schema.String),
  blocked: Schema.Boolean,
  blocked_reason: Schema.NullOr(Schema.String),
  human_action: Schema.NullOr(Schema.String),
  next_command: Schema.NullOr(Schema.String),
  toolkit: Schema.NullOr(Schema.String),
});
type OnboardDocument = Schema.Schema.Type<typeof OnboardDocument>;

const decodeOnboardDocument = Schema.decodeUnknownSync(Schema.parseJson(OnboardDocument));

const soleDocument = (stdout: string): OnboardDocument => decodeOnboardDocument(stdout.trim());

const runOnboard = (server: MockAgentsServer, suffix: string, args: string): string =>
  [
    `HOME=/tmp/onboard-${suffix}`,
    `COMPOSIO_CACHE_DIR=/tmp/onboard-${suffix}`,
    `COMPOSIO_BASE_URL=${server.dockerBaseUrl}`,
    `COMPOSIO_AGENTS_BASE_URL=${server.dockerBaseUrl}`,
    'COMPOSIO_CLI_TELEMETRY_DISABLED=1',
    `composio onboard ${args}`,
  ].join(' ');

e2e(import.meta.url, {
  versions: { cli: ['current'] },
  defineTests: ({ runCmd }) => {
    let loginServer: MockAgentsServer;
    let statusServer: MockAgentsServer;
    let unsupportedServer: MockAgentsServer;
    let loggedOut: E2ETestResult;
    let status: E2ETestResult;
    let unsupported: E2ETestResult;

    beforeAll(async () => {
      [loginServer, statusServer, unsupportedServer] = await Promise.all([
        startMockAgentsServer(),
        startMockAgentsServer(),
        startMockAgentsServer(),
      ]);
      loggedOut = await runCmd(runOnboard(loginServer, 'login', '--json'));
      status = await runCmd(runOnboard(statusServer, 'status', '--status --json'));
      unsupported = await runCmd(
        runOnboard(unsupportedServer, 'unsupported', '--toolkit stripe --json')
      );
    }, TIMEOUTS.FIXTURE);

    afterAll(async () => {
      await Promise.all([loginServer?.close(), statusServer?.close(), unsupportedServer?.close()]);
    });

    it('advances only login and emits one flat logged-out JSON document', () => {
      expect(loggedOut.exitCode).toBe(0);
      expect(soleDocument(loggedOut.stdout)).toEqual({
        kind: 'onboard_state',
        version: 1,
        onboarded: false,
        next_gate: 'login',
        blocked: true,
        blocked_reason: 'login_required',
        human_action: expect.stringContaining('cliKey='),
        next_command: 'composio login',
        toolkit: null,
      });
      expect(loginServer.requests).toEqual(['POST /api/v3.1/cli/create-session']);
    });

    it('reports logged-out status without any API request', () => {
      expect(status.exitCode).toBe(0);
      expect(soleDocument(status.stdout)).toMatchObject({
        kind: 'onboard_state',
        version: 1,
        onboarded: false,
        next_gate: 'login',
        blocked_reason: 'login_required',
      });
      expect(statusServer.requests).toEqual([]);
    });

    it('rejects an unsupported toolkit without writing a JSON document', () => {
      expect(unsupported.exitCode).not.toBe(0);
      expect(unsupported.stdout.trim()).toBe('');
      expect(unsupportedServer.requests).toEqual([]);
    });
  },
});
