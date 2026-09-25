import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gallerySource = readFileSync(
  join(import.meta.dir, '../../components/examples-gallery.tsx'),
  'utf8',
);

describe('examples gallery', () => {
  test('occupies the main DocsLayout grid area', () => {
    expect(gallerySource).toContain('[grid-area:main]');
  });
});
