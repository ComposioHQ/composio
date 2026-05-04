import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteFile } from '../../src/models/RemoteFile';
import { RemoteFileDownloadError, ValidationError } from '../../src/errors';

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

      expect(globalThis.fetch).toHaveBeenCalledWith(validCamelCaseData.downloadUrl);
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
