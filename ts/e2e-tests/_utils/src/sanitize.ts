/**
 * Output sanitization utilities for stable test comparisons.
 */

/**
 * Sanitize command output for stable snapshot comparisons.
 * Removes ANSI escape codes, normalizes line endings, and trims whitespace.
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
      // Trim trailing whitespace from each line
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      // Trim leading/trailing whitespace from entire output
      .trim()
  );
}
