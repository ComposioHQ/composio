import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFileDataAfterUploadingToS3, downloadFileFromS3 } from '../../src/utils/fileUtils';
import ComposioClient from '@composio/client';
import * as uuid from '../../src/utils/uuid';

// Mock the uuid module
vi.mock('../../src/utils/uuid', () => ({
  getRandomShortId: vi.fn(() => 'abc12345'),
  getRandomUUID: vi.fn(() => '12345678-1234-1234-1234-123456789012'),
}));

// Mock fs module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

// Mock os module
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/test'),
  },
  homedir: vi.fn(() => '/home/test'),
}));

// Mock path module
vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    basename: vi.fn(path => path.split('/').pop()),
  },
  join: vi.fn((...args) => args.join('/')),
  basename: vi.fn(path => path.split('/').pop()),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fileUtils', () => {
  let mockClient: ComposioClient;

  beforeEach(() => {
    mockClient = {
      files: {
        createPresignedURL: vi.fn(),
      },
    } as unknown as ComposioClient;

    vi.clearAllMocks();

    // Mock Date.now to return a consistent timestamp
    vi.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL filename generation with query parameters', () => {
    beforeEach(() => {
      // Mock successful fetch response
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        headers: new Map([['content-type', 'application/pdf']]),
      });

      // Mock successful S3 upload
      (mockClient.files.createPresignedURL as any).mockResolvedValue({
        key: 'test-key',
        type: 'new',
        new_presigned_url: 'https://s3.example.com/upload',
      });

      // Mock successful PUT to S3
      mockFetch.mockImplementation((url, options) => {
        if (options?.method === 'PUT') {
          return Promise.resolve({ ok: true });
        }
        // For the initial file fetch
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
          headers: new Map([['content-type', 'application/pdf']]),
        });
      });
    });

    it('should handle URLs with query parameters correctly', async () => {
      const urlWithQuery =
        'https://example.com/document.pdf?param1=value1&param2=value2&token=abc123';

      const result = await getFileDataAfterUploadingToS3(urlWithQuery, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });

      expect(result.name).toBe('document.pdf');
      expect(mockFetch).toHaveBeenCalledWith(urlWithQuery);
    });

    it('should generate filename when URL has no filename', async () => {
      const urlWithoutFilename = 'https://example.com/?download=true&format=pdf';

      const result = await getFileDataAfterUploadingToS3(urlWithoutFilename, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });

      expect(result.name).toBe('file_ts1640995200000abc12345.pdf');
    });

    it('should generate filename when URL path ends with slash', async () => {
      const urlEndingWithSlash = 'https://example.com/folder/?type=document';

      const result = await getFileDataAfterUploadingToS3(urlEndingWithSlash, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });

      expect(result.name).toBe('file_ts1640995200000abc12345.pdf');
    });

    it('should add extension to filename without extension based on MIME type', async () => {
      const urlWithoutExtension = 'https://example.com/document?format=pdf';

      const result = await getFileDataAfterUploadingToS3(urlWithoutExtension, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });

      expect(result.name).toBe('file_ts1640995200000abc12345.pdf');
    });
  });

  describe('MIME type extension handling', () => {
    it('should handle structured MIME types with + correctly', async () => {
      const testCases = [
        { mimeType: 'application/vnd.api+json', expectedExt: 'json' },
        { mimeType: 'application/ld+json', expectedExt: 'json' },
        { mimeType: 'image/svg+xml', expectedExt: 'svg' },
        { mimeType: 'application/atom+xml', expectedExt: 'atom' },
        { mimeType: 'application/rss+xml', expectedExt: 'rss' },
        { mimeType: 'application/hal+json', expectedExt: 'json' },
        { mimeType: 'application/vnd.collection+json', expectedExt: 'json' },
        { mimeType: 'application/vnd.custom+zip', expectedExt: 'zip' },
      ];

      for (const { mimeType, expectedExt } of testCases) {
        // Reset mocks for each iteration
        vi.clearAllMocks();

        // Mock successful fetch response
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
          headers: new Map([['content-type', mimeType]]),
        });

        // Mock successful S3 upload
        (mockClient.files.createPresignedURL as any).mockResolvedValueOnce({
          key: 'test-key',
          type: 'new',
          new_presigned_url: 'https://s3.example.com/upload',
        });

        // Mock successful PUT to S3
        mockFetch.mockResolvedValueOnce({ ok: true });

        const result = await getFileDataAfterUploadingToS3('https://example.com/file', {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          client: mockClient,
        });

        expect(result.name).toBe(`file_ts1640995200000abc12345.${expectedExt}`);
      }
    });

    it('should handle MIME types with parameters', async () => {
      // Reset mocks
      vi.clearAllMocks();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        headers: new Map([['content-type', 'text/plain; charset=utf-8']]),
      });

      // Mock successful S3 upload
      (mockClient.files.createPresignedURL as any).mockResolvedValueOnce({
        key: 'test-key',
        type: 'new',
        new_presigned_url: 'https://s3.example.com/upload',
      });

      // Mock successful PUT to S3
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await getFileDataAfterUploadingToS3('https://example.com/file', {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });

      expect(result.name).toBe('file_ts1640995200000abc12345.txt');
    });

    it('should handle common MIME types', async () => {
      const testCases = [
        { mimeType: 'application/pdf', expectedExt: 'pdf' },
        { mimeType: 'image/jpeg', expectedExt: 'jpg' },
        { mimeType: 'image/png', expectedExt: 'png' },
        { mimeType: 'text/html', expectedExt: 'html' },
        { mimeType: 'application/json', expectedExt: 'json' },
        { mimeType: 'video/mp4', expectedExt: 'mp4' },
      ];

      for (const { mimeType, expectedExt } of testCases) {
        // Reset mocks for each iteration
        vi.clearAllMocks();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
          headers: new Map([['content-type', mimeType]]),
        });

        // Mock successful S3 upload
        (mockClient.files.createPresignedURL as any).mockResolvedValueOnce({
          key: 'test-key',
          type: 'new',
          new_presigned_url: 'https://s3.example.com/upload',
        });

        // Mock successful PUT to S3
        mockFetch.mockResolvedValueOnce({ ok: true });

        const result = await getFileDataAfterUploadingToS3('https://example.com/file', {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          client: mockClient,
        });

        expect(result.name).toBe(`file_ts1640995200000abc12345.${expectedExt}`);
      }
    });

    it('should fallback to generic extraction for unknown MIME types', async () => {
      // Reset mocks
      vi.clearAllMocks();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        headers: new Map([['content-type', 'application/custom-format']]),
      });

      // Mock successful S3 upload
      (mockClient.files.createPresignedURL as any).mockResolvedValueOnce({
        key: 'test-key',
        type: 'new',
        new_presigned_url: 'https://s3.example.com/upload',
      });

      // Mock successful PUT to S3
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await getFileDataAfterUploadingToS3('https://example.com/file', {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });

      expect(result.name).toBe('file_ts1640995200000abc12345.custom-format');
    });
  });

  describe('downloadFileFromS3', () => {
    it('should generate filename with tool slug prefix', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

      const result = await downloadFileFromS3({
        toolSlug: 'github',
        s3Url: 'https://s3.example.com/file.txt',
        mimeType: 'text/plain',
      });

      expect(result.name).toBe('github_1640995200000abc12345.txt');
    });

    it('should handle MIME types with + in downloadFileFromS3', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

      const result = await downloadFileFromS3({
        toolSlug: 'api-tool',
        s3Url: 'https://s3.example.com/data.json',
        mimeType: 'application/vnd.api+json',
      });

      expect(result.name).toBe('api-tool_1640995200000abc12345.json');
    });

    it('should handle download failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(
        downloadFileFromS3({
          toolSlug: 'test-tool',
          s3Url: 'https://s3.example.com/nonexistent.txt',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow('Failed to download file: Not Found');
    });
  });

  describe('File object handling', () => {
    it('should handle File objects correctly', async () => {
      // Reset mocks
      vi.clearAllMocks();

      // Mock successful S3 upload
      (mockClient.files.createPresignedURL as any).mockResolvedValueOnce({
        key: 'test-key',
        type: 'new',
        new_presigned_url: 'https://s3.example.com/upload',
      });

      // Mock successful PUT to S3
      mockFetch.mockResolvedValueOnce({ ok: true });

      const fileContent = 'test file content';
      const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

      const result = await getFileDataAfterUploadingToS3(file, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });

      expect(result.name).toBe('test.txt');
      expect(result.mimetype).toBe('text/plain');
    });
  });

  // Note: Local file handling tests are covered in the existing fileModifiers.test.ts

  describe('Error handling', () => {
    it('should handle fetch errors for URLs', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(
        getFileDataAfterUploadingToS3('https://example.com/file.pdf', {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          client: mockClient,
        })
      ).rejects.toThrow('Failed to fetch file: Internal Server Error');
    });

    it('should handle S3 upload errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        headers: new Map([['content-type', 'application/pdf']]),
      });

      (mockClient.files.createPresignedURL as any).mockResolvedValue({
        key: 'test-key',
        type: 'new',
        new_presigned_url: 'https://s3.example.com/upload',
      });

      // Mock failed S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Upload Failed',
      });

      await expect(
        getFileDataAfterUploadingToS3('https://example.com/file.pdf', {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          client: mockClient,
        })
      ).rejects.toThrow('Failed to upload file to S3: Upload Failed');
    });

    it('should handle invalid file types', async () => {
      await expect(
        getFileDataAfterUploadingToS3(123 as any, {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          client: mockClient,
        })
      ).rejects.toThrow('Invalid file type');
    });
  });
});
