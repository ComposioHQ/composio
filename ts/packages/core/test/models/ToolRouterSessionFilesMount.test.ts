import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRouterSessionFilesMount } from '../../src/models/ToolRouterSessionFileMount';
import { ValidationError } from '../../src/errors';
import { DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID } from '../../src/utils/constants';

const sessionId = 'trs_session_123';

const createMockClient = () => ({
  toolRouter: {
    session: {
      files: {
        list: vi.fn(),
        createUploadURL: vi.fn(),
        createDownloadURL: vi.fn(),
        delete: vi.fn(),
      },
    },
  },
});

describe('ToolRouterSessionFilesMount', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let filesMount: ToolRouterSessionFilesMount;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    filesMount = new ToolRouterSessionFilesMount(mockClient as any, sessionId);
  });

  describe('list', () => {
    it('should call list with default mountId and no path', async () => {
      mockClient.toolRouter.session.files.list.mockResolvedValueOnce({ items: [] });

      const result = await filesMount.list();

      expect(mockClient.toolRouter.session.files.list).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_prefix: undefined,
          cursor: undefined,
          limit: undefined,
        }
      );
      expect(result).toEqual({ items: [], nextCursor: undefined });
    });

    it('should call list with custom path and mountId (strips leading slash for API)', async () => {
      mockClient.toolRouter.session.files.list.mockResolvedValueOnce({ items: [] });

      await filesMount.list({
        path: '/documents',
        mountId: 'custom-mount',
      });

      expect(mockClient.toolRouter.session.files.list).toHaveBeenCalledWith('custom-mount', {
        session_id: sessionId,
        mount_relative_prefix: 'documents',
        cursor: undefined,
        limit: undefined,
      });
    });

    it('should return transformed response with items and nextCursor', async () => {
      const apiResponse = {
        items: [
          {
            last_modified: '2025-03-09T12:00:00.000Z',
            mount_relative_path: 'file.txt',
            sandbox_mount_prefix: '/mnt/files',
            size: 42,
          },
        ],
        next_cursor: 'cursor_abc123',
      };
      mockClient.toolRouter.session.files.list.mockResolvedValueOnce(apiResponse);

      const result = await filesMount.list();

      expect(result).toEqual({
        items: [
          {
            lastModified: '2025-03-09T12:00:00.000Z',
            mountRelativePath: 'file.txt',
            sandboxMountPrefix: '/mnt/files',
            size: 42,
          },
        ],
        nextCursor: 'cursor_abc123',
      });
    });

    it('should pass cursor and limit for pagination (path / omitted for root)', async () => {
      mockClient.toolRouter.session.files.list.mockResolvedValueOnce({ items: [] });

      await filesMount.list({
        path: '/',
        cursor: 'cursor_page2',
        limit: 25,
      });

      expect(mockClient.toolRouter.session.files.list).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_prefix: undefined,
          cursor: 'cursor_page2',
          limit: 25,
        }
      );
    });
  });

  describe('download', () => {
    const createDownloadURLResponse = {
      expires_at: '2025-12-31T23:59:59.000Z',
      mount_relative_path: 'output/report.pdf',
      sandbox_mount_prefix: '/mnt/files',
      download_url: 'https://s3.example.com/presigned',
    };

    it('should call createDownloadURL and return RemoteFile', async () => {
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce(
        createDownloadURLResponse
      );

      const result = await filesMount.download('/output/report.pdf');

      expect(mockClient.toolRouter.session.files.createDownloadURL).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_path: '/output/report.pdf',
        }
      );
      expect(result).toBeDefined();
      expect(result.mountRelativePath).toBe('output/report.pdf');
      expect(result.downloadUrl).toBe('https://s3.example.com/presigned');
    });

    it('should use custom mountId when provided', async () => {
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce(
        createDownloadURLResponse
      );

      await filesMount.download('/output/report.pdf', { mountId: 'exports' });

      expect(mockClient.toolRouter.session.files.createDownloadURL).toHaveBeenCalledWith(
        'exports',
        {
          session_id: sessionId,
          mount_relative_path: '/output/report.pdf',
        }
      );
    });
  });

  describe('delete', () => {
    const deleteResponse = {
      mount_relative_path: '/temp/cache.json',
      sandbox_mount_prefix: '/mnt/files',
    };

    it('should call delete and return parsed response', async () => {
      mockClient.toolRouter.session.files.delete.mockResolvedValueOnce(deleteResponse);

      const result = await filesMount.delete('/temp/cache.json');

      expect(mockClient.toolRouter.session.files.delete).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_path: '/temp/cache.json',
        }
      );
      expect(result).toEqual({
        mountRelativePath: '/temp/cache.json',
        sandboxMountPrefix: '/mnt/files',
      });
    });

    it('should use custom mountId when provided', async () => {
      mockClient.toolRouter.session.files.delete.mockResolvedValueOnce(deleteResponse);

      await filesMount.delete('/old-backup', { mountId: 'backups' });

      expect(mockClient.toolRouter.session.files.delete).toHaveBeenCalledWith('backups', {
        session_id: sessionId,
        mount_relative_path: '/old-backup',
      });
    });
  });

  describe('upload', () => {
    const mountRelativePath = 'composio-upload-test.txt';
    const createUploadURLResponse = {
      upload_url: 'https://s3.example.com/upload',
      mount_relative_path: mountRelativePath,
      sandbox_mount_prefix: '/mnt/files',
      expires_at: '2025-12-31T23:59:59.000Z',
    };

    const createDownloadURLResponse = {
      download_url: 'https://s3.example.com/presigned',
      mount_relative_path: mountRelativePath,
      sandbox_mount_prefix: '/mnt/files',
      expires_at: '2025-12-31T23:59:59.000Z',
    };

    beforeEach(() => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          return Promise.resolve({ ok: true });
        }
        return Promise.reject(new Error('Unexpected fetch'));
      }) as unknown as typeof fetch;
    });

    it('should upload local file and return RemoteFile', async () => {
      const { platform } = await import('../../src/platform/node');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const testFilePath = join(tmpdir(), 'composio-upload-test.txt');
      platform.writeFileSync(testFilePath, 'test content', 'utf8');

      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce(
        createUploadURLResponse
      );
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce(
        createDownloadURLResponse
      );

      const result = await filesMount.upload(testFilePath);

      expect(mockClient.toolRouter.session.files.createUploadURL).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_path: 'composio-upload-test.txt',
          mimetype: 'application/octet-stream',
        }
      );
      expect(mockClient.toolRouter.session.files.createDownloadURL).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_path: mountRelativePath,
        }
      );
      expect(result.mountRelativePath).toBe(mountRelativePath);
      expect(result.downloadUrl).toBe('https://s3.example.com/presigned');
    });

    it('should handle upload response body wrapper', async () => {
      const { platform } = await import('../../src/platform/node');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const testFilePath = join(tmpdir(), 'composio-upload-test.txt');
      platform.writeFileSync(testFilePath, 'test content', 'utf8');

      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce({
        url: 'https://api.example.com/upload_url',
        status: 201,
        body: createUploadURLResponse,
      });
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce(
        createDownloadURLResponse
      );

      const result = await filesMount.upload(testFilePath);

      expect(result.mountRelativePath).toBe(mountRelativePath);
      expect(result.downloadUrl).toBe('https://s3.example.com/presigned');
    });

    it('should upload native File object', async () => {
      const file = new File([new TextEncoder().encode('hello')], 'greeting.txt', {
        type: 'text/plain',
      });

      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce({
        ...createUploadURLResponse,
        mount_relative_path: 'greeting.txt',
      });
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce({
        ...createDownloadURLResponse,
        mount_relative_path: 'greeting.txt',
      });

      const result = await filesMount.upload(file);

      expect(mockClient.toolRouter.session.files.createUploadURL).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_path: 'greeting.txt',
          mimetype: 'text/plain',
        }
      );
      expect(result.mountRelativePath).toBe('greeting.txt');
    });

    it('should upload File with custom remotePath', async () => {
      const file = new File([new Uint8Array([1, 2, 3])], 'original.bin', {
        type: 'application/octet-stream',
      });

      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce({
        ...createUploadURLResponse,
        mount_relative_path: 'custom-name.bin',
      });
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce({
        ...createDownloadURLResponse,
        mount_relative_path: 'custom-name.bin',
      });

      const result = await filesMount.upload(file, { remotePath: 'custom-name.bin' });

      expect(mockClient.toolRouter.session.files.createUploadURL).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_path: 'custom-name.bin',
          mimetype: 'application/octet-stream',
        }
      );
      expect(result.mountRelativePath).toBe('custom-name.bin');
    });

    it('should upload raw buffer with remotePath and mimetype', async () => {
      const buffer = new TextEncoder().encode('{"key":"value"}');

      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce({
        ...createUploadURLResponse,
        mount_relative_path: 'data.json',
      });
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce({
        ...createDownloadURLResponse,
        mount_relative_path: 'data.json',
      });

      const result = await filesMount.upload(buffer, {
        remotePath: 'data.json',
        mimetype: 'application/json',
      });

      expect(mockClient.toolRouter.session.files.createUploadURL).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        {
          session_id: sessionId,
          mount_relative_path: 'data.json',
          mimetype: 'application/json',
        }
      );
      expect(result.mountRelativePath).toBe('data.json');
    });

    it('should return mountRelativePath from API response when it differs from requested path', async () => {
      const buffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG signature

      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce({
        ...createUploadURLResponse,
        mount_relative_path: 'upload-7949b409.jpg', // API returns different path
      });
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce({
        ...createDownloadURLResponse,
        mount_relative_path: 'upload-7949b409.jpg',
      });

      const result = await filesMount.upload(buffer, { remotePath: 'file.png' });

      expect(result.mountRelativePath).toBe('upload-7949b409.jpg');
    });

    it('should throw when buffer is provided without mimetype or remotePath', async () => {
      const buffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      await expect(filesMount.upload(buffer)).rejects.toThrow(
        'When passing a buffer, either mimetype or remotePath (filename) is required'
      );
    });

    it('should upload ArrayBuffer with mimetype when remotePath omitted', async () => {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setUint32(0, 0xdeadbeef);

      mockClient.toolRouter.session.files.createUploadURL.mockImplementation((_, params) =>
        Promise.resolve({
          ...createUploadURLResponse,
          mount_relative_path: params.mount_relative_path,
        })
      );
      mockClient.toolRouter.session.files.createDownloadURL.mockImplementation((_, params) =>
        Promise.resolve({
          ...createDownloadURLResponse,
          mount_relative_path: params.mount_relative_path,
        })
      );

      const result = await filesMount.upload(buffer, { mimetype: 'application/octet-stream' });

      expect(mockClient.toolRouter.session.files.createUploadURL).toHaveBeenCalledWith(
        DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        expect.objectContaining({
          session_id: sessionId,
          mimetype: 'application/octet-stream',
          mount_relative_path: expect.stringMatching(/^upload-.+\.bin$/),
        })
      );
      expect(result.mountRelativePath).toMatch(/^upload-.+\.bin$/);
    });
  });
});
