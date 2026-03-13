/**
 * Output sanitization utilities for stable test comparisons.
 */

import type { E2ETestResult } from './types';

/**
 * Sanitize command output for stable comparisons.
 * Removes ANSI escape codes, normalizes line endings, and trims leading/trailing
 * whitespace around the first/last meaningful output.
 *
 * @param output - Raw command output (stdout or stderr)
 * @returns Sanitized output suitable for assertions and snapshots
 */
export function sanitizeOutput(output: string): string {
  return (
    output
      // Remove ANSI escape codes (colors, formatting)
      .replace(/\x1b\[[0-9;]*m/g, '')
      // Normalize line endings (Windows → Unix)
      .replace(/\r\n/g, '\n')
      // Trim leading/trailing whitespace from entire output
      .trim()
  );
}

/**
 * Parse JSON from a command's stdout, providing a clear error message on failure.
 *
 * When the CLI errors out (e.g. 401), stdout is empty and `JSON.parse("")` throws
 * a cryptic `SyntaxError: Unexpected EOF`. This helper surfaces the actual exit code
 * and stderr so the root cause is immediately visible.
 */
export function parseJsonStdout(result: E2ETestResult): unknown {
  const raw = sanitizeOutput(result.stdout);
  if (raw === '') {
    const stderrPreview = sanitizeOutput(result.stderr).slice(0, 300);
    throw new Error(
      `stdout was empty — cannot parse JSON.\n` +
        `  exitCode: ${result.exitCode}\n` +
        `  stderr: ${stderrPreview || '(empty)'}`
    );
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    const stderrPreview = sanitizeOutput(result.stderr).slice(0, 300);
    throw new Error(
      `stdout was not valid JSON.\n` +
        `  exitCode: ${result.exitCode}\n` +
        `  stdout: ${raw.slice(0, 300)}\n` +
        `  stderr: ${stderrPreview || '(empty)'}`,
      { cause }
    );
  }
}
