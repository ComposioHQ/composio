/**
 * CLI `composio manage toolkits info` e2e test
 *
 * Verifies that the info subcommand returns detailed toolkit JSON in piped mode,
 * handles invalid slugs gracefully, and supports stdout redirection.
 */

import {
  e2e,
  sanitizeOutput,
  parseJsonStdout,
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

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  env: {
    COMPOSIO_USER_API_KEY: Bun.env.COMPOSIO_USER_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    let validResult: E2ETestResult;
    let redirectResult: E2ETestResultWithFiles<'out.json'>;
    let invalidResult: E2ETestResult;
    let missingSlugResult: E2ETestResult;

    beforeAll(async () => {
      validResult = await runCmd('composio manage toolkits info gmail');
      redirectResult = await runCmd({
        command: 'composio manage toolkits info gmail > out.json',
        files: ['out.json'],
      });
      invalidResult = await runCmd('composio manage toolkits info nonexistent_toolkit_xyz12345');
      missingSlugResult = await runCmd('composio manage toolkits info');
    }, TIMEOUTS.FIXTURE);

    describe('composio manage toolkits info gmail (valid slug)', () => {
      it('exits successfully', () => {
        expect(validResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(validResult.stderr).toBe('');
      });

      it('stdout is a valid JSON object', () => {
        const obj = parseJsonStdout(validResult);
        expect(typeof obj).toBe('object');
        expect(Array.isArray(obj)).toBe(false);
      });

      it('has the correct name and slug', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(obj.name).toBe('Gmail');
        expect(obj.slug).toBe('gmail');
      });

      it('has meta with description and logo', () => {
        const obj = parseJsonStdout(validResult) as Record<string, Record<string, unknown>>;
        expect(obj.meta).toHaveProperty('description');
        expect(typeof obj.meta.description).toBe('string');
        expect(obj.meta).toHaveProperty('logo');
      });

      it('has is_no_auth and enabled', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(typeof obj.is_no_auth).toBe('boolean');
        expect(typeof obj.enabled).toBe('boolean');
      });

      it('has composio_managed_auth_schemes array', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(Array.isArray(obj.composio_managed_auth_schemes)).toBe(true);
      });

      it('has connected_account (object or null)', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(obj).toHaveProperty('connected_account');
      });
    });

    describe('composio manage toolkits info gmail > out.json (stdout redirection)', () => {
      it('exits successfully', () => {
        expect(redirectResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(redirectResult.stdout).toBe('');
      });

      it('stderr is empty', () => {
        expect(redirectResult.stderr).toBe('');
      });

      it('out.json contains valid JSON with slug "gmail"', () => {
        const content = redirectResult.files['out.json'];
        const obj = JSON.parse(sanitizeOutput(content));
        expect(obj.slug).toBe('gmail');
      });
    });

    describe('composio manage toolkits info nonexistent_toolkit_xyz12345 (invalid slug)', () => {
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

    describe('composio manage toolkits info (missing slug)', () => {
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
