import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import ComposioClient from '@composio/client';
import { getFileDataAfterUploadingToS3 } from '../../src/utils/fileUtils.node';

// The S3 PUT runs through the SSRF guard, which resolves the host first.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

describe('getFileDataAfterUploadingToS3 — local file names', () => {
  let tmp: string;
  let createPresignedURL: ReturnType<typeof vi.fn>;
  let client: ComposioClient;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-name-'));
    createPresignedURL = vi.fn().mockResolvedValue({
      key: 'test-key',
      type: 'new',
      new_presigned_url: 'https://s3.example.com/upload',
    });
    client = { files: { createPresignedURL } } as unknown as ComposioClient;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmp, { recursive: true, force: true });
  });

  const upload = (file: string) =>
    getFileDataAfterUploadingToS3(file, { toolSlug: 'T', toolkitSlug: 'tk', client });

  it('takes the extension from the file name, not from a dotted directory', async () => {
    const dir = path.join(tmp, 'my.project');
    mkdirSync(dir);
    const file = path.join(dir, 'Makefile');
    writeFileSync(file, 'all:');

    const result = await upload(file);

    expect(result.name).toMatch(/^file_ts[^/\\]*\.txt$/);
    expect(createPresignedURL.mock.calls[0][0].filename).toBe(result.name);
  });

  it('never puts the local path into the name of an extensionless file', async () => {
    const file = path.join(tmp, 'LICENSE');
    writeFileSync(file, 'MIT');

    const result = await upload(file);

    expect(result.name).not.toContain(tmp);
    expect(result.name).toMatch(/^file_ts[^/\\]*\.txt$/);
  });

  it('keeps a real extension', async () => {
    const file = path.join(tmp, 'notes.v2.md');
    writeFileSync(file, '# hi');

    const result = await upload(file);

    expect(result.name).toMatch(/^file_ts[^/\\]*\.md$/);
  });
});
