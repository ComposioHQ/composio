/**
 * CLI `composio orgs switch` e2e test
 *
 * Verifies that `orgs switch` respects `--limit`, writes global org state,
 * and returns machine-readable JSON in piped mode.
 */

import {
  e2e,
  parseJsonStdout,
  type E2ETestResultWithFiles,
} from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  startMockOrgsSwitchServer,
  type MockOrgsSwitchServer,
} from '../../../../packages/cli/scripts/mock-orgs-switch-server';

const USER_DATA_PATH = '/tmp/composio-orgs-switch/user_data.json' as const;

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let server: MockOrgsSwitchServer;
    let switchResult: E2ETestResultWithFiles<typeof USER_DATA_PATH>;

    beforeAll(async () => {
      server = await startMockOrgsSwitchServer();
      switchResult = await runCmd({
        command: [
          `COMPOSIO_BASE_URL=${server.dockerBaseUrl}`,
          'COMPOSIO_CACHE_DIR=/tmp/composio-orgs-switch',
          'COMPOSIO_USER_API_KEY=uak_mock_orgs_switch',
          'composio orgs switch --limit 2',
        ].join(' '),
        files: [USER_DATA_PATH],
      });
    }, TIMEOUTS.FIXTURE);

    afterAll(async () => {
      await server.close();
    });

    describe('composio orgs switch --limit 2', () => {
      it('exits successfully', () => {
        expect(switchResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(switchResult.stderr).toBe('');
      });

      it('stdout returns the selected global org', () => {
        expect(parseJsonStdout(switchResult)).toEqual({
          scope: 'global',
          org_id: 'org_alpha',
        });
      });

      it('stores the selected org in user_data.json', () => {
        const userData = JSON.parse(switchResult.files[USER_DATA_PATH]) as Record<string, unknown>;
        expect(userData.org_id).toBe('org_alpha');
        expect(userData.project_id).toBeUndefined();
      });

      it('requests the org list with the provided limit', () => {
        expect(server.requests).toContain('GET /api/v3/org/list?limit=2');
      });
    });
  },
});
