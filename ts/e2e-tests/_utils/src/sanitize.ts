/**
 * Output sanitization utilities for stable test comparisons.
 */

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
