/**
 * Behavior matrix for the file upload / download gating introduced with
 * `fileUploadDirs` and `fileDownloadDir`. Exercises the interaction between:
 *
 *   - `dangerouslyAllowAutoUploadDownloadFiles` (off | on)
 *   - Caller  (automatic via `tools.execute` | manual via `composio.files.*`)
 *   - Direction (upload | download)
 *   - `fileUploadDirs` shape (`undefined`, `false`, `[]`, `string[]`)
 *
 * Runtime filesystem operations and HTTP are mocked; we only assert what the
 * SDK tries to do and what errors it raises.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import ComposioClient from '@composio/client';

import { Tools } from '../../src/models/Tools';
import { Files } from '../../src/models/Files.node';
import * as fileUtilsModule from '../../src/utils/fileUtils.node';
import { mockClient } from '../utils/mocks/client.mock';
import { MockProvider } from '../utils/mocks/provider.mock';
import {
  ComposioFileUploadPathNotAllowedError,
  ComposioFileNotFoundError,
} from '../../src/errors/FileModifierErrors';
import { getDefaultUploadDir } from '../../src/utils/fileDirs';

// Mock network-bound helpers so we can assert inputs without hitting the API.
vi.mock('../../src/utils/fileUtils.node', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/utils/fileUtils.node')>();
  return {
    ...actual,
    downloadFileFromS3: vi.fn(),
    // Keep the real `getFileDataAfterUploadingToS3` so path checks run, but
    // stub the S3 upload happening inside it.
    uploadFileToS3: vi.fn(),
  };
});

const mkTemp = () => mkdtempSync(path.join(os.tmpdir(), 'composio-matrix-'));

const makeTools = (opts: {
  dangerouslyAllowAutoUploadDownloadFiles?: boolean;
  fileUploadDirs?: string[] | false;
  fileDownloadDir?: string;
}) => {
  return new Tools(mockClient as unknown as ComposioClient, {
    provider: new MockProvider(),
    ...opts,
  });
};

describe('File handling matrix — Tools constructor resolves allowlist correctly', () => {
  afterEach(() => vi.clearAllMocks());

  describe('dangerouslyAllowAutoUploadDownloadFiles = false (default)', () => {
    it('leaves fileUploadAllowlist undefined (auto-upload code path is never run)', () => {
      const t = makeTools({});
      // `fileUploadAllowlist` lives on the private options the class forwards
      // to FileToolModifier. When the flag is off we leave it undefined so the
      // modifier isn't even constructed.
      expect(
        (t as unknown as { fileUploadPathOptions: { fileUploadAllowlist?: string[] } })
          .fileUploadPathOptions.fileUploadAllowlist
      ).toBeUndefined();
    });

    it('ignores fileUploadDirs entirely (including `false`)', () => {
      const t = makeTools({ fileUploadDirs: false });
      expect(
        (t as unknown as { fileUploadPathOptions: { fileUploadAllowlist?: string[] } })
          .fileUploadPathOptions.fileUploadAllowlist
      ).toBeUndefined();
    });
  });

  describe('dangerouslyAllowAutoUploadDownloadFiles = true', () => {
    it('defaults fileUploadAllowlist to [~/.composio/temp] when fileUploadDirs is unset', () => {
      const t = makeTools({ dangerouslyAllowAutoUploadDownloadFiles: true });
      const opts = (t as unknown as { fileUploadPathOptions: { fileUploadAllowlist?: string[] } })
        .fileUploadPathOptions;
      expect(opts.fileUploadAllowlist).toEqual([getDefaultUploadDir()]);
    });

    it('resolves to [] when fileUploadDirs is `false` (explicit "no local paths")', () => {
      const t = makeTools({
        dangerouslyAllowAutoUploadDownloadFiles: true,
        fileUploadDirs: false,
      });
      const opts = (t as unknown as { fileUploadPathOptions: { fileUploadAllowlist?: string[] } })
        .fileUploadPathOptions;
      expect(opts.fileUploadAllowlist).toEqual([]);
    });

    it('resolves to [] when fileUploadDirs is `[]` (alias for `false`)', () => {
      const t = makeTools({
        dangerouslyAllowAutoUploadDownloadFiles: true,
        fileUploadDirs: [],
      });
      const opts = (t as unknown as { fileUploadPathOptions: { fileUploadAllowlist?: string[] } })
        .fileUploadPathOptions;
      expect(opts.fileUploadAllowlist).toEqual([]);
    });

    it('uses user-provided dirs verbatim when fileUploadDirs is a non-empty array', () => {
      const dir = mkTemp();
      try {
        const t = makeTools({
          dangerouslyAllowAutoUploadDownloadFiles: true,
          fileUploadDirs: [dir],
        });
        const opts = (t as unknown as { fileUploadPathOptions: { fileUploadAllowlist?: string[] } })
          .fileUploadPathOptions;
        expect(opts.fileUploadAllowlist).toEqual([path.resolve(dir)]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

describe('File handling matrix — manual Files API bypasses the allowlist', () => {
  const mkClient = () =>
    ({
      baseURL: 'https://api.composio.dev',
      apiKey: 'test',
    }) as unknown as ComposioClient;

  beforeEach(() => vi.clearAllMocks());

  it('composio.files.upload() accepts a local path that is NOT in any allowlist', async () => {
    const tmp = mkTemp();
    try {
      const file = path.join(tmp, 'a.txt');
      writeFileSync(file, 'x');

      // Stub the actual S3 call so the manual upload can complete.
      const stubbed = vi.spyOn(fileUtilsModule, 'getFileDataAfterUploadingToS3');
      stubbed.mockResolvedValueOnce({ name: 'a.txt', mimetype: 'text/plain', s3key: 'k' });

      const files = new Files(mkClient());
      const result = await files.upload({
        file,
        toolSlug: 'T',
        toolkitSlug: 'tk',
      });

      expect(result.s3key).toBe('k');

      // The call must NOT include a `fileUploadAllowlist` — that's what keeps
      // manual upload unconstrained.
      const callArg = stubbed.mock.calls[0]?.[1] as { fileUploadAllowlist?: unknown };
      expect(callArg.fileUploadAllowlist).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('composio.files.download() works regardless of `dangerouslyAllowAutoUploadDownloadFiles`', async () => {
    const downloadMock = vi.spyOn(fileUtilsModule, 'downloadFileFromS3');
    downloadMock.mockResolvedValueOnce({
      name: 'x.txt',
      mimeType: 'text/plain',
      s3Url: 'https://s3.example/x',
      filePath: '/tmp/fake/x.txt',
    });

    const files = new Files(mkClient(), { fileDownloadDir: '/var/app/dl' });
    const res = await files.download({
      toolSlug: 'T',
      s3Url: 'https://s3.example/x',
      mimeType: 'text/plain',
    });

    expect(res.filePath).toBe('/tmp/fake/x.txt');
    // The manual download path forwards the configured `fileDownloadDir`.
    expect(downloadMock.mock.calls[0]?.[0]).toMatchObject({
      fileDownloadDir: '/var/app/dl',
    });
  });
});

describe('File handling matrix — auto upload honors the resolved allowlist', () => {
  let getFileDataSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Keep the real implementation so allowlist enforcement runs, but stub the
    // S3 upload that happens inside it.
    getFileDataSpy = vi.spyOn(fileUtilsModule, 'uploadFileToS3' as never);
    (getFileDataSpy as unknown as { mockResolvedValue: (v: string) => void }).mockResolvedValue(
      's3-key'
    );
  });

  const callUpload = async (file: string, fileUploadAllowlist: string[] | undefined) => {
    return fileUtilsModule.getFileDataAfterUploadingToS3(file, {
      toolSlug: 'T',
      toolkitSlug: 'tk',
      client: mockClient as unknown as ComposioClient,
      fileUploadAllowlist,
    });
  };

  it('rejects local paths outside the allowlist with ComposioFileUploadPathNotAllowedError', async () => {
    const allowed = mkTemp();
    const outside = mkTemp();
    try {
      const file = path.join(outside, 'leak.txt');
      writeFileSync(file, 'x');
      await expect(callUpload(file, [allowed])).rejects.toBeInstanceOf(
        ComposioFileUploadPathNotAllowedError
      );
    } finally {
      rmSync(allowed, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects ALL local paths when allowlist is [] (the `false` / fail-closed case)', async () => {
    const tmp = mkTemp();
    try {
      const file = path.join(tmp, 'a.txt');
      writeFileSync(file, 'x');
      await expect(callUpload(file, [])).rejects.toBeInstanceOf(
        ComposioFileUploadPathNotAllowedError
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allows URLs even when allowlist is [] (URLs are never path-checked)', async () => {
    // Stub global fetch so `readFile` (URL branch) doesn't hit the network.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('stubbed-network'));

    // Passes the allowlist gate (because the URL isn't a local path), then
    // fails at the network layer. Any non-allowlist error proves the gate
    // didn't reject the URL.
    const http = 'https://example.com/file.pdf';
    await expect(callUpload(http, [])).rejects.toThrowError('stubbed-network');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('raises ComposioFileNotFoundError when the file is missing under auto-upload', async () => {
    const allowed = mkTemp();
    try {
      const missing = path.join(allowed, 'nope.txt');
      await expect(callUpload(missing, [allowed])).rejects.toBeInstanceOf(
        ComposioFileNotFoundError
      );
    } finally {
      rmSync(allowed, { recursive: true, force: true });
    }
  });

  it('does NOT throw an allowlist error when the file is inside an allowed dir', async () => {
    // We can't easily stub the S3 upload from outside the module, so we just
    // assert the error (if any) is not the allowlist rejection. The happy
    // path for `assertPathInsideUploadDirs` itself is covered directly in
    // `test/utils/uploadDirAllowlist.test.ts`.
    const allowed = mkTemp();
    try {
      const file = path.join(allowed, 'ok.txt');
      writeFileSync(file, 'x');
      try {
        await callUpload(file, [allowed]);
      } catch (err) {
        expect(err).not.toBeInstanceOf(ComposioFileUploadPathNotAllowedError);
        expect(err).not.toBeInstanceOf(ComposioFileNotFoundError);
      }
    } finally {
      rmSync(allowed, { recursive: true, force: true });
    }
  });
});
