import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ComposioClient from '@composio/client';
import { ToolRouterSessionFilesMount } from '../../src/models/ToolRouterSessionFileMount';
import { ComposioBlockedInternalUrlError, ValidationError } from '../../src/errors';
import { DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID } from '../../src/utils/constants';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

// eslint-disable-next-line no-restricted-imports
import { lookup } from 'node:dns/promises';

const mockLookup = vi.mocked(lookup);

const sessionId = 'trs_session_123';

const createMockClient = () => {
  const client = new ComposioClient({ apiKey: 'test-api-key' });
  const files = Object.assign(client.toolRouter.session.files, {
    list: vi.fn<typeof client.toolRouter.session.files.list>(),
    createUploadURL: vi.fn<typeof client.toolRouter.session.files.createUploadURL>(),
    createDownloadURL: vi.fn<typeof client.toolRouter.session.files.createDownloadURL>(),
    delete: vi.fn<typeof client.toolRouter.session.files.delete>(),
  });
  const session = Object.assign(client.toolRouter.session, { files });
  const toolRouter = Object.assign(client.toolRouter, { session });
  return Object.assign(client, { toolRouter });
};

describe('ToolRouterSessionFilesMount', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let filesMount: ToolRouterSessionFilesMount;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup.mockReset();
    // Uploads PUT to a response-supplied `upload_url`, which is now validated
    // like any other fetch target; resolve test hosts as public by default so
    // only the tests that care about the guard have to say anything about DNS.
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    mockClient = createMockClient();
    filesMount = new ToolRouterSessionFilesMount(mockClient, sessionId);
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
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          if (init?.method === 'PUT') {
            return Promise.resolve({ ok: true });
          }
          return Promise.reject(new Error('Unexpected fetch'));
        })
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it.each([
      ['loopback', 'http://127.0.0.1/private', '127.0.0.1'],
      ['cloud metadata', 'http://169.254.169.254/latest/meta-data/', '169.254.169.254'],
    ])('should block %s URL uploads before fetching', async (_label, url, address) => {
      mockLookup.mockResolvedValueOnce([{ address, family: 4 }] as never);

      await expect(filesMount.upload(url)).rejects.toBeInstanceOf(ComposioBlockedInternalUrlError);

      expect(fetch).not.toHaveBeenCalled();
      expect(mockClient.toolRouter.session.files.createUploadURL).not.toHaveBeenCalled();
      expect(mockClient.toolRouter.session.files.createDownloadURL).not.toHaveBeenCalled();
    });

    it('should block a public URL that redirects to cloud metadata', async () => {
      mockLookup
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
        .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }] as never);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      );

      await expect(filesMount.upload('https://public.example/redirect')).rejects.toBeInstanceOf(
        ComposioBlockedInternalUrlError
      );

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockClient.toolRouter.session.files.createUploadURL).not.toHaveBeenCalled();
    });

    it('should release a failed URL response body before throwing', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      const cancel = vi.fn();
      const response = new Response(new ReadableStream({ cancel }), {
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.mocked(fetch).mockResolvedValueOnce(response);

      await expect(filesMount.upload('https://files.example/failed.txt')).rejects.toThrow(
        'Failed to fetch file from URL: Internal Server Error'
      );

      expect(cancel).toHaveBeenCalledOnce();
      expect(response.bodyUsed).toBe(true);
      expect(mockClient.toolRouter.session.files.createUploadURL).not.toHaveBeenCalled();
    });

    it('should fetch and upload a public URL through the SSRF-safe path', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response('hello', {
            status: 200,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce({
        ...createUploadURLResponse,
        mount_relative_path: 'hello.txt',
      });
      mockClient.toolRouter.session.files.createDownloadURL.mockResolvedValueOnce({
        ...createDownloadURLResponse,
        mount_relative_path: 'hello.txt',
      });

      const result = await filesMount.upload('https://files.example/hello.txt');

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://files.example/hello.txt',
        expect.objectContaining({ redirect: 'manual' })
      );
      expect(result.mountRelativePath).toBe('hello.txt');
    });

    it('should reject a URL response whose declared size exceeds 100 MiB', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('small body', {
          status: 200,
          headers: {
            'content-type': 'text/plain',
            'content-length': String(100 * 1024 * 1024 + 1),
          },
        })
      );

      await expect(filesMount.upload('https://files.example/oversized.txt')).rejects.toThrow(
        'exceeds maximum allowed size'
      );

      expect(mockClient.toolRouter.session.files.createUploadURL).not.toHaveBeenCalled();
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

    it('should block a response-supplied upload_url that resolves internally', async () => {
      // The user-supplied URL branch above was already guarded; `upload_url`
      // comes back from the API and was not. Both are untrusted here, and this
      // one receives the file's bytes.
      mockClient.toolRouter.session.files.createUploadURL.mockResolvedValueOnce({
        ...createUploadURLResponse,
        upload_url: 'http://metadata.example/upload',
      });
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);

      await expect(
        filesMount.upload(new File(['data'], 'report.txt', { type: 'text/plain' }))
      ).rejects.toBeInstanceOf(ComposioBlockedInternalUrlError);

      expect(fetch).not.toHaveBeenCalled();
      expect(mockClient.toolRouter.session.files.createDownloadURL).not.toHaveBeenCalled();
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
