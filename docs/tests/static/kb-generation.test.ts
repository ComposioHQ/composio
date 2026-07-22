import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { generateKbContent } from '@/lib/kb/generate';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

describe('public KB content generation', () => {
  test('generates native Fumadocs pages for published guides only', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    const summary = generateKbContent({ outputDir });
    const files = listFiles(outputDir);

    expect(summary).toEqual({ published: 2, held: 1, files: files.length });
    expect(files).toContain('tool-router-and-mcp/use-tool-router-session-files-as-tool-inputs.mdx');
    expect(files).toContain('sdk-and-api/pagination-limits-are-endpoint-specific.mdx');
    expect(files.some((file) => file.includes('auth-config-list-pages'))).toBe(false);

    const guide = readFileSync(
      join(outputDir, 'sdk-and-api/pagination-limits-are-endpoint-specific.mdx'),
      'utf8',
    );
    expect(guide).toContain('sourceCommit: "5eed614"');
    expect(guide).toContain('lastVerifiedAt: "2026-07-21"');
    expect(guide).toContain('reviewAfter: "2027-01-17"');
  });

  test('detects generated content drift in check mode', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    expect(() => generateKbContent({ outputDir, check: true })).toThrow(
      'Generated KB content is out of date',
    );
  });
});
