import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteFile } from '../../src/models/RemoteFile';
import {
  ComposioBlockedInternalUrlError,
  RemoteFileDownloadError,
  ValidationError,
} from '../../src/errors';

// `downloadUrl` comes from an API response, so downloads run through the SSRF
// guard, which resolves the host before connecting. Resolve as public by
// default; the guard's own tests cover the blocking behavior.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

// eslint-disable-next-line no-restricted-imports
import { lookup } from 'node:dns/promises';

const mockLookup = vi.mocked(lookup);

describe('RemoteFile', () => {
  const validCamelCaseData = {
    expiresAt: '2025-12-31T23:59:59.000Z',
    mountRelativePath: 'output/report.pdf',
    sandboxMountPrefix: '/mnt/files',
    downloadUrl: 'https://s3.example.com/presigned-url',
  };

  const validSnakeCaseData = {
    expires_at: '2025-12-31T23:59:59.000Z',
    mount_relative_path: 'output/report.pdf',
    sandbox_mount_prefix: '/mnt/files',
    download_url: 'https://s3.example.com/presigned-url',
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockLookup.mockReset();
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create instance with valid camelCase data', () => {
      const file = new RemoteFile(validCamelCaseData);
      expect(file.expiresAt).toBe(validCamelCaseData.expiresAt);
      expect(file.mountRelativePath).toBe(validCamelCaseData.mountRelativePath);
      expect(file.sandboxMountPrefix).toBe(validCamelCaseData.sandboxMountPrefix);
      expect(file.downloadUrl).toBe(validCamelCaseData.downloadUrl);
    });
  });

  describe('parse', () => {
    it('should parse snake_case API response and return RemoteFile', () => {
      const file = RemoteFile.parse(validSnakeCaseData);
      expect(file).toBeInstanceOf(RemoteFile);
      expect(file.expiresAt).toBe(validSnakeCaseData.expires_at);
      expect(file.mountRelativePath).toBe(validSnakeCaseData.mount_relative_path);
      expect(file.downloadUrl).toBe(validSnakeCaseData.download_url);
    });

    it('should throw ValidationError for invalid data', () => {
      expect(() => RemoteFile.parse({})).toThrow(ValidationError);
      expect(() => RemoteFile.parse({ expires_at: 'x' })).toThrow(ValidationError);
      expect(() => RemoteFile.parse(null)).toThrow(ValidationError);
    });
  });

  describe('filename', () => {
    it('should return basename of mount path', () => {
      const file = new RemoteFile(validCamelCaseData);
      expect(file.filename).toBe('report.pdf');
    });

    it('should handle nested path', () => {
      const file = new RemoteFile({
        ...validCamelCaseData,
        mountRelativePath: 'output/subdir/data.json',
      });
      expect(file.filename).toBe('data.json');
    });
  });

  describe('buffer', () => {
    it('should fetch and return file content as Uint8Array', async () => {
      const content = new Uint8Array([1, 2, 3]);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      });

      const file = new RemoteFile(validCamelCaseData);
      const result = await file.buffer();

      // `redirect: 'manual'` is the guard following redirects itself so it can
      // re-validate each hop, rather than letting fetch follow them unchecked;
      // the `dispatcher` alongside it pins the connection to the address the
      // guard validated.
      expect(globalThis.fetch).toHaveBeenCalledWith(
        validCamelCaseData.downloadUrl,
        expect.objectContaining({ redirect: 'manual' })
      );
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(content);
    });

    it('should throw RemoteFileDownloadError when fetch fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const file = new RemoteFile(validCamelCaseData);

      await expect(file.buffer()).rejects.toThrow(RemoteFileDownloadError);
      await expect(file.buffer()).rejects.toMatchObject({
        name: 'RemoteFileDownloadError',
        message: expect.stringContaining('404'),
      });
    });
  });

  describe('text', () => {
    it('should fetch and return file content as UTF-8 string', async () => {
      const content = 'Hello, World!';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
      });

      const file = new RemoteFile(validCamelCaseData);
      const result = await file.text();

      expect(result).toBe(content);
    });
  });

  describe('blob', () => {
    it('should fetch and return file content as Blob', async () => {
      const blob = new Blob(['data']);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(blob),
      });

      const file = new RemoteFile(validCamelCaseData);
      const result = await file.blob();

      expect(result).toBe(blob);
    });

    it('should throw RemoteFileDownloadError when fetch fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const file = new RemoteFile(validCamelCaseData);

      await expect(file.blob()).rejects.toThrow(RemoteFileDownloadError);
    });
  });

  describe('SSRF guard', () => {
    // `downloadUrl` is set from an API response. Under the SDK's trust boundary
    // that is untrusted input, so a response naming an internal address must
    // not be fetched — the bytes go straight back to the caller, typically into
    // an LLM context.
    it.each([
      ['loopback', 'http://127.0.0.1/secret', '127.0.0.1'],
      ['cloud metadata', 'http://169.254.169.254/latest/meta-data/', '169.254.169.254'],
    ])('should block a %s downloadUrl before fetching', async (_label, downloadUrl, address) => {
      mockLookup.mockResolvedValue([{ address, family: 4 }] as never);
      globalThis.fetch = vi.fn();

      const file = new RemoteFile({ ...validCamelCaseData, downloadUrl });

      await expect(file.buffer()).rejects.toBeInstanceOf(ComposioBlockedInternalUrlError);
      await expect(file.blob()).rejects.toBeInstanceOf(ComposioBlockedInternalUrlError);
      await expect(file.text()).rejects.toBeInstanceOf(ComposioBlockedInternalUrlError);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should block a downloadUrl that redirects into private space', async () => {
      mockLookup
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
        .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }] as never);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      );

      const file = new RemoteFile(validCamelCaseData);

      await expect(file.buffer()).rejects.toBeInstanceOf(ComposioBlockedInternalUrlError);
      // The first hop was fetched; the redirect target never was.
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('save', () => {
    it('should save file to specified path when platform supports file system', async () => {
      const content = new Uint8Array([1, 2, 3]);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      });

      const file = new RemoteFile(validCamelCaseData);
      const { platform } = await import('../../src/platform/node');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const savePath = join(tmpdir(), `composio-remote-file-test-${Date.now()}.pdf`);

      const result = await file.save(savePath);

      expect(result).toBe(savePath);
      expect(platform.existsSync(savePath)).toBe(true);
      const written = platform.readFileSync(savePath) as Uint8Array;
      expect(new Uint8Array(written)).toEqual(content);
    });
  });
});
