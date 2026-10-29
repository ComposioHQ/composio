import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_PATH = join(import.meta.dir, '../../kb/source/toolkits/youtube/public.md');

describe('YouTube update safety guidance', () => {
  test('documents that partial video status updates can clear unspecified flags', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('YOUTUBE_UPDATE_VIDEO');
    expect(source).toContain('embeddable');
    expect(source).toContain('publicStatsViewable');
    expect(source).toContain('read-modify-write');
  });
});
