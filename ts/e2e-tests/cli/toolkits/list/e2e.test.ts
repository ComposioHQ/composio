/**
 * CLI `composio dev toolkits list` e2e test
 *
 * Verifies that the list subcommand returns toolkits as JSON in piped mode,
 * supports deterministic `--query` filtering, and respects `--limit`.
 */

import {
  e2e,
  sanitizeOutput,
  parseJsonStdout,
  type E2ETestResult,
} from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  startMockToolkitsListServer,
  type MockToolkitsServer,
} from '../../../../packages/cli/scripts/mock-toolkits-server';

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let server: MockToolkitsServer;
    let exactResult: E2ETestResult;
    let prefixResult: E2ETestResult;
    let noFuzzyResult: E2ETestResult;

    beforeAll(async () => {
      server = await startMockToolkitsListServer();

      const envPrefix = [
        `COMPOSIO_BASE_URL=${server.dockerBaseUrl}`,
        'COMPOSIO_CACHE_DIR=/tmp/composio-toolkits-list',
        'COMPOSIO_USER_API_KEY=uak_mock_toolkits_list',
      ].join(' ');

      exactResult = await runCmd(`${envPrefix} composio dev toolkits list --query gmail --limit 1`);
      prefixResult = await runCmd(`${envPrefix} composio dev toolkits list --query gmai --limit 1`);
      noFuzzyResult = await runCmd(`${envPrefix} composio dev toolkits list --query gmal --limit 1`);
    }, TIMEOUTS.FIXTURE);

    afterAll(async () => {
      await server.close();
    });

    describe('composio dev toolkits list --query gmail --limit 1 (exact slug)', () => {
      it('exits successfully', () => {
        expect(exactResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(exactResult.stderr).toBe('');
      });

      it('stdout is a JSON array with 1 element', () => {
        const items = parseJsonStdout(exactResult);
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
      });

      it('the element has slug "gmail"', () => {
        const items = parseJsonStdout(exactResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe('gmail');
      });

      it('the element has the expected shape', () => {
        const item = (parseJsonStdout(exactResult) as Array<Record<string, unknown>>)[0];
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('slug');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('latest_version');
        expect(item).toHaveProperty('tools_count');
        expect(item).toHaveProperty('triggers_count');
        expect(item).toHaveProperty('is_no_auth');
        expect(item).toHaveProperty('enabled');
        expect(item).toHaveProperty('connected');
      });
    });

    describe('composio dev toolkits list --query gmai --limit 1 (prefix search)', () => {
      it('exits successfully', () => {
        expect(prefixResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(prefixResult.stderr).toBe('');
      });

      it('stdout is a JSON array with 1 element', () => {
        const items = parseJsonStdout(prefixResult);
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
      });

      it('the element has slug "gmail"', () => {
        const items = parseJsonStdout(prefixResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe('gmail');
      });
    });

    describe('composio dev toolkits list --query gmal --limit 1 (no fuzzy search)', () => {
      it('exits successfully', () => {
        expect(noFuzzyResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(noFuzzyResult.stderr).toBe('');
      });

      it('stdout is an empty JSON array (no results)', () => {
        expect(sanitizeOutput(noFuzzyResult.stdout)).toBe('[]');
      });
    });

    describe('mock API usage', () => {
      it('requests the toolkit catalog for each search term', () => {
        expect(server.requests).toContain('GET /api/v3/toolkits?search=gmail&limit=1');
        expect(server.requests).toContain('GET /api/v3/toolkits?search=gmai&limit=1');
        expect(server.requests).toContain('GET /api/v3/toolkits?search=gmal&limit=1');
      });
    });
  },
});
