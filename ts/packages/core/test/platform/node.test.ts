import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { platform } from '../../src/platform/node';

const invertAsciiCase = (value: string): string =>
  [...value]
    .map(character => {
      const upper = character.toUpperCase();
      return character === upper ? character.toLowerCase() : upper;
    })
    .join('');

describe('node platform filesystem case detection', () => {
  it('detects the target filesystem for existing and not-yet-created paths', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-case-sensitivity-'));
    try {
      const probeDirectory = path.join(root, 'CaseProbe');
      mkdirSync(probeDirectory);
      const existingFile = path.join(probeDirectory, 'config.json');
      writeFileSync(existingFile, '{}');

      const caseVariantExists = existsSync(path.join(root, invertAsciiCase('CaseProbe')));
      const expected = !caseVariantExists;

      expect(platform.isFileSystemCaseSensitive(existingFile)).toBe(expected);
      expect(
        platform.isFileSystemCaseSensitive(
          path.join(probeDirectory, 'not-created-yet', 'config.json')
        )
      ).toBe(expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
