import type { FenceLocation } from './pages';
import type { Violation } from './policy';

export interface OptOut extends FenceLocation {
  readonly reason: string;
}

export interface CheckResult {
  readonly checked: number;
  readonly signatures: number;
  readonly optedOut: ReadonlyArray<OptOut>;
  readonly violations: ReadonlyArray<Violation>;
}

const where = (violation: Violation) =>
  [violation.className, violation.method ?? violation.section]
    .filter(part => part !== null)
    .join(' > ');

const formatViolation = (violation: Violation) => {
  const place = violation.page === null ? '(program)' : `${violation.page}:${violation.line ?? ''}`;
  const heading = where(violation);
  return `${place}${heading === '' ? '' : ` ${heading}`} [${violation.rule}] ${violation.message}`;
};

/** The human-readable report: violations, then counts, then every opt-out with its reason. */
export const formatText = (result: CheckResult) => {
  const lines = result.violations.map(formatViolation);
  if (lines.length > 0) lines.push('');
  lines.push(
    `Checked ${result.checked} fence(s), skipped ${result.signatures} signature fence(s), opted out ${result.optedOut.length} fence(s).`
  );
  if (result.optedOut.length > 0) {
    lines.push('Opted out:');
    for (const optOut of result.optedOut)
      lines.push(`  ${optOut.page}:${optOut.line} ${optOut.reason}`);
  }
  lines.push(
    result.violations.length === 0 ? 'No violations.' : `${result.violations.length} violation(s).`
  );
  return lines.join('\n');
};

export const formatJson = (result: CheckResult) =>
  JSON.stringify(
    {
      checked: result.checked,
      signatures: result.signatures,
      optedOut: result.optedOut,
      violations: result.violations,
    },
    null,
    2
  );
