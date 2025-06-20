import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileToolModifier } from '../../src/utils/modifiers/FileToolModifier';
import ComposioClient from '@composio/client';
import { Tool } from '../../src/types/tool.types';
import { ComposioFileUploadError } from '../../src/errors/FileModifierErrors';
import * as fileUtils from '../../src/utils/fileUtils';

// Mock the fileUtils module
vi.mock('../../src/utils/fileUtils', () => ({
  downloadFileFromS3: vi.fn(),
  getFileDataAfterUploadingToS3: vi.fn(),
}));

describe('FileToolModifier', () => {
  let fileToolModifier: FileToolModifier;
  let mockClient: ComposioClient;

  beforeEach(() => {
    mockClient = {
      baseURL: 'https://api.composio.dev',
      apiKey: 'test-api-key',
    } as ComposioClient;
    fileToolModifier = new FileToolModifier(mockClient);
    vi.clearAllMocks();
  });

  describe('modifyToolSchema', () => {
    it('should return schema unchanged if no input parameters', async () => {
      const schema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
      };

      const result = await fileToolModifier.modifyToolSchema('test-tool', 'test-toolkit', schema);
      expect(result).toEqual(schema);
    });

    it('should add format: "path" to file_uploadable properties', async () => {
      const schema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              file_uploadable: true,
            },
            text: {
              type: 'string',
            },
          },
        },
      };

      const result = await fileToolModifier.modifyToolSchema('test-tool', 'test-toolkit', schema);
      expect(result.inputParameters?.properties?.file).toHaveProperty('format', 'path');
      expect(result.inputParameters?.properties?.text).not.toHaveProperty('format');
    });
  });

  describe('fileUploadModifier', () => {
    const mockTool: Tool = {
      slug: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      tags: ['test'],
      inputParameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            file_uploadable: true,
          },
          text: {
            type: 'string',
          },
        },
      },
    };

    it('should upload file for file_uploadable parameters', async () => {
      const mockFileData = {
        name: 'file.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/file.txt',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      const params = {
        arguments: {
          file: '/path/to/file.txt',
          text: 'some text',
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(mockTool, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith(
        '/path/to/file.txt',
        'test-tool',
        'test-toolkit',
        mockClient
      );
      expect(result.arguments?.file).toEqual(mockFileData);
      expect(result.arguments?.text).toBe('some text');
    });

    it('should throw ComposioFileUploadError on upload failure', async () => {
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockRejectedValue(
        new Error('Upload failed')
      );

      const params = {
        arguments: {
          file: '/path/to/file.txt',
        },
        userId: 'test-user',
      };

      await expect(
        fileToolModifier.fileUploadModifier(mockTool, {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          params,
        })
      ).rejects.toThrow(ComposioFileUploadError);
    });
  });

  describe('fileDownloadModifier', () => {
    const mockTool: Tool = {
      slug: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      tags: ['test'],
    };

    it('should download file from S3 URL', async () => {
      const mockDownloadResult = {
        name: 'file.txt',
        mimeType: 'text/plain',
        s3Key: 'downloads/file.txt',
        filePath: '/downloaded/file.txt',
      };
      vi.mocked(fileUtils.downloadFileFromS3).mockResolvedValue(mockDownloadResult);

      const result = {
        data: {
          file: {
            s3url: 'https://s3.example.com/file.txt',
            mimetype: 'text/plain',
          },
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(mockTool, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).toHaveBeenCalledWith({
        toolSlug: 'test-tool',
        s3Url: 'https://s3.example.com/file.txt',
        mimeType: 'text/plain',
      });

      expect(modifiedResult.data.file).toEqual({
        uri: '/downloaded/file.txt',
        file_downloaded: true,
        s3url: 'https://s3.example.com/file.txt',
        mimeType: 'text/plain',
      });
    });

    it('should handle download failure gracefully', async () => {
      vi.mocked(fileUtils.downloadFileFromS3).mockRejectedValue(new Error('Download failed'));

      const result = {
        data: {
          file: {
            s3url: 'https://s3.example.com/file.txt',
            mimetype: 'text/plain',
          },
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(mockTool, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(modifiedResult.data.file).toEqual({
        uri: '',
        file_downloaded: false,
        s3url: 'https://s3.example.com/file.txt',
        mimeType: 'text/plain',
      });
    });

    it('should skip fields without s3url', async () => {
      const result = {
        data: {
          text: 'some text',
          file: {
            other_field: 'value',
          },
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(mockTool, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).not.toHaveBeenCalled();
      expect(modifiedResult).toEqual(result);
    });
  });
});
