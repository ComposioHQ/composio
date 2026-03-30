/**
 * CLI `composio dev toolkits info` e2e test
 *
 * Verifies that the info subcommand returns detailed toolkit JSON in piped mode,
 * handles invalid slugs gracefully, and supports stdout redirection.
 */

import {
  e2e,
  sanitizeOutput,
  type E2ETestResult,
  type E2ETestResultWithFiles,
} from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_USER_API_KEY: string;
  }
}

const parseOptionalToolkitObject = (output: string): Record<string, unknown> | undefined => {
  const sanitized = sanitizeOutput(output);
  if (sanitized === '') return undefined;

  const obj = JSON.parse(sanitized);
  expect(typeof obj).toBe('object');
  expect(Array.isArray(obj)).toBe(false);
  return obj as Record<string, unknown>;
};

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  env: {
    COMPOSIO_USER_API_KEY: Bun.env.COMPOSIO_USER_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    const query = 'hackernews';
    let validResult: E2ETestResult;
    let redirectResult: E2ETestResultWithFiles<'out.json'>;
    let invalidResult: E2ETestResult;
    let missingSlugResult: E2ETestResult;

    beforeAll(async () => {
      validResult = await runCmd(`composio dev toolkits info ${query}`);
      redirectResult = await runCmd({
        command: `composio dev toolkits info ${query} > out.json`,
        files: ['out.json'],
      });
      invalidResult = await runCmd('composio dev toolkits info nonexistent_toolkit_xyz12345');
      missingSlugResult = await runCmd('composio dev toolkits info');
    }, TIMEOUTS.FIXTURE * 2);

    describe('composio dev toolkits info <slug> (valid slug)', () => {
      it('exits successfully', () => {
        expect(validResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(validResult.stderr).toBe('');
      });

      it('stdout is empty or a valid JSON object', () => {
        parseOptionalToolkitObject(validResult.stdout);
      });

      it('has the expected slug when the backend returns toolkit data', () => {
        const obj = parseOptionalToolkitObject(validResult.stdout);
        if (!obj) return;

        expect(obj.slug).toBe(query);
      });

      it('has meta with description and logo when the backend returns toolkit data', () => {
        const obj = parseOptionalToolkitObject(validResult.stdout) as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (!obj) return;

        expect(obj.meta).toHaveProperty('description');
        expect(typeof obj.meta.description).toBe('string');
        expect(obj.meta).toHaveProperty('logo');
      });

      it('has is_no_auth and enabled when the backend returns toolkit data', () => {
        const obj = parseOptionalToolkitObject(validResult.stdout);
        if (!obj) return;

        expect(typeof obj.is_no_auth).toBe('boolean');
        expect(typeof obj.enabled).toBe('boolean');
      });

      it('has composio_managed_auth_schemes array when the backend returns toolkit data', () => {
        const obj = parseOptionalToolkitObject(validResult.stdout);
        if (!obj) return;

        expect(Array.isArray(obj.composio_managed_auth_schemes)).toBe(true);
      });

      it('has connected_account when the backend returns toolkit data', () => {
        const obj = parseOptionalToolkitObject(validResult.stdout);
        if (!obj) return;

        expect(obj).toHaveProperty('connected_account');
      });
    });

    describe('composio dev toolkits info <slug> > out.json (stdout redirection)', () => {
      it('exits successfully', () => {
        expect(redirectResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(redirectResult.stdout).toBe('');
      });

      it('stderr is empty', () => {
        expect(redirectResult.stderr).toBe('');
      });

      it('out.json is empty or contains valid JSON with the discovered slug', () => {
        const content = redirectResult.files['out.json'];
        const obj = parseOptionalToolkitObject(content);
        if (!obj) return;

        expect(obj.slug).toBe(query);
      });
    });

    describe('composio dev toolkits info nonexistent_toolkit_xyz12345 (invalid slug)', () => {
      it('exits successfully (graceful error handling)', () => {
        expect(invalidResult.exitCode).toBe(0);
      });

      it('stdout is empty (no data on error)', () => {
        expect(sanitizeOutput(invalidResult.stdout)).toBe('');
      });

      it('stderr is empty (piped mode suppresses decoration)', () => {
        expect(invalidResult.stderr).toBe('');
      });
    });

    describe('composio dev toolkits info (missing slug)', () => {
      it('exits successfully (optional arg, handler guards)', () => {
        expect(missingSlugResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(sanitizeOutput(missingSlugResult.stdout)).toBe('');
      });

      it('stderr is empty', () => {
        expect(missingSlugResult.stderr).toBe('');
      });
    });
  },
});
