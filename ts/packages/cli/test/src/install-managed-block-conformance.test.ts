import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  appendManagedBlocks,
  pathBlockForShell,
  reconcileManagedPathBlock,
  type Shell,
} from 'src/commands/install.cmd';

/**
 * Managed PATH block contract conformance.
 *
 * The fixtures under test/managed-block-fixtures also drive install.sh's
 * write_path_block through the shell harness
 * (test/install-sh-release-resolution.test.sh), so an edit to either
 * implementation fails one of the two suites until the other side produces
 * byte-identical output again. Each fixture directory holds the rc file
 * `before` the run, the raw `bin-dir` (with `__HOME__` standing in for the
 * home directory), the target `shell`, and the expected `after` bytes.
 */

const FIXTURES_URL = new URL('../../../../../test/managed-block-fixtures/', import.meta.url);
const HOME = '/home/conformance';

const readFixture = (caseName: string, file: string): string =>
  readFileSync(new URL(`${caseName}/${file}`, FIXTURES_URL), 'utf8');

const fixtureNames = readdirSync(FIXTURES_URL, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

describe('managed PATH block conformance with install.sh', () => {
  it('finds the shared fixtures', () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });

  it.each(fixtureNames)('reconciles %s byte-identically to install.sh', caseName => {
    const binDir = readFixture(caseName, 'bin-dir').trim().replace('__HOME__', HOME);
    const shell = readFixture(caseName, 'shell').trim() as Shell;
    const before = readFixture(caseName, 'before');
    const expected = readFixture(caseName, 'after');

    // Mirror installShellIntegration's write flow: a current block leaves the
    // file untouched, a stale block is reconciled, and an absent block is
    // appended after the existing content.
    const pathBlock = pathBlockForShell(shell, binDir, HOME);
    const reconciliation = reconcileManagedPathBlock(before, pathBlock);
    const after =
      reconciliation.state === 'current'
        ? before
        : reconciliation.state === 'stale'
          ? reconciliation.reconciled
          : appendManagedBlocks(before, [pathBlock]);

    expect(after).toBe(expected);
  });
});
