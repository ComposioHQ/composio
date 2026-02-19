/**
 * CLI `composio toolkits info` e2e test
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
    COMPOSIO_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    let validResult: E2ETestResult;
    let redirectResult: E2ETestResultWithFiles<'out.json'>;
    let invalidResult: E2ETestResult;
    let missingSlugResult: E2ETestResult;

    beforeAll(async () => {
      validResult = await runCmd('composio toolkits info gmail');
      redirectResult = await runCmd({
        command: 'composio toolkits info gmail > out.json',
        files: ['out.json'],
      });
      invalidResult = await runCmd('composio toolkits info nonexistent_toolkit_xyz12345');
      missingSlugResult = await runCmd('composio toolkits info');
    }, TIMEOUTS.FIXTURE);

    describe('composio toolkits info gmail (valid slug)', () => {
      it('exits successfully', () => {
        expect(validResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(validResult.stderr).toBe('');
      });

      it('stdout is a valid JSON object', () => {
        const obj = JSON.parse(sanitizeOutput(validResult.stdout));
        expect(typeof obj).toBe('object');
        expect(Array.isArray(obj)).toBe(false);
      });

      it('has the correct name and slug', () => {
        const obj = JSON.parse(sanitizeOutput(validResult.stdout));
        expect(obj.name).toBe('Gmail');
        expect(obj.slug).toBe('gmail');
      });

      it('has meta with description, tools_count, and triggers_count', () => {
        const obj = JSON.parse(sanitizeOutput(validResult.stdout));
        expect(obj.meta).toHaveProperty('description');
        expect(typeof obj.meta.tools_count).toBe('number');
        expect(typeof obj.meta.triggers_count).toBe('number');
      });

      it('has auth_config_details array', () => {
        const obj = JSON.parse(sanitizeOutput(validResult.stdout));
        expect(Array.isArray(obj.auth_config_details)).toBe(true);
        expect(obj.auth_config_details.length).toBeGreaterThan(0);
      });

      it('each auth_config_detail has mode, name, and fields', () => {
        const obj = JSON.parse(sanitizeOutput(validResult.stdout));
        for (const detail of obj.auth_config_details) {
          expect(detail).toHaveProperty('mode');
          expect(detail).toHaveProperty('name');
          expect(detail).toHaveProperty('fields');
          expect(detail.fields).toHaveProperty('auth_config_creation');
          expect(detail.fields).toHaveProperty('connected_account_initiation');
        }
      });

      it('has composio_managed_auth_schemes, no_auth, and is_local_toolkit', () => {
        const obj = JSON.parse(sanitizeOutput(validResult.stdout));
        expect(Array.isArray(obj.composio_managed_auth_schemes)).toBe(true);
        expect(typeof obj.no_auth).toBe('boolean');
        expect(typeof obj.is_local_toolkit).toBe('boolean');
      });
    });

    describe('composio toolkits info gmail > out.json (stdout redirection)', () => {
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
        const obj = JSON.parse(sanitizeOutput(redirectResult.files['out.json']));
        expect(obj.slug).toBe('gmail');
      });
    });

    describe('composio toolkits info nonexistent_toolkit_xyz12345 (invalid slug)', () => {
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

    describe('composio toolkits info (missing slug)', () => {
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
