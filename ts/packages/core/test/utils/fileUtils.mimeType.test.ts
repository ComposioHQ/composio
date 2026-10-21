import { afterEach, describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import ComposioClient from '@composio/client';
import { DEFAULT_MIME_TYPE, getMimeTypeFromFileName } from '../../src/utils/mime';
import { getFileDataAfterUploadingToS3 } from '../../src/utils/fileUtils.node';

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

describe('getMimeTypeFromFileName', () => {
  it.each([
    ['deck.pptx', PPTX],
    ['/tmp/dir/Report.PDF', 'application/pdf'],
    [
      'C:\\Users\\me\\sheet.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    ['notes.md', 'text/markdown'],
    ['photo.jpeg', 'image/jpeg'],
    ['archive.tar.gz', 'application/gzip'],
  ])('maps %s to %s', (fileName, mimeType) => {
    expect(getMimeTypeFromFileName(fileName)).toBe(mimeType);
  });

  it.each([
    'README',
    '.env',
    'dir.d/file',
    'blob.unknownext',
    '',
    // Object.prototype members are not extensions.
    'report.constructor',
    'report.__proto__',
    'report.toString',
    'report.hasOwnProperty',
  ])('falls back to octet-stream for %j', fileName => {
    expect(getMimeTypeFromFileName(fileName)).toBe(DEFAULT_MIME_TYPE);
  });
});

describe('getFileDataAfterUploadingToS3 — local path MIME type (issue #4984)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('labels a local .pptx with its PPTX MIME type in the presign request, the PUT, and the result', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-mime-'));
    const file = path.join(root, 'deck.pptx');
    writeFileSync(file, 'PK fake pptx');
    const createPresignedURL = vi.fn().mockResolvedValue({
      key: 's3key-deck',
      type: 'new',
      new_presigned_url: 'https://1.1.1.1/put',
    });
    const client = { files: { createPresignedURL } } as unknown as ComposioClient;
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await getFileDataAfterUploadingToS3(file, {
        toolSlug: 'CANVA_CREATE_DESIGN_IMPORT_JOB',
        toolkitSlug: 'canva',
        client,
      });

      expect(createPresignedURL).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: PPTX }),
        expect.anything()
      );
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(new Headers(init.headers).get('content-type')).toBe(PPTX);
      expect(result).toMatchObject({ mimetype: PPTX, s3key: 's3key-deck' });
      expect(result.name).toMatch(/\.pptx$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
