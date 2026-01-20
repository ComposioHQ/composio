import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileToolModifier } from '../../src/utils/modifiers/FileToolModifier';
import ComposioClient from '@composio/client';
import { Tool } from '../../src/types/tool.types';
import { ComposioFileUploadError } from '../../src/errors/FileModifierErrors';
import * as fileUtils from '../../src/utils/fileUtils';
import { Tools } from '../../src/models/Tools';
import { createTestContext, setupTest, mockToolExecution } from '../utils/toolExecuteUtils';
import { mockClient } from '../utils/mocks/client.mock';

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
        version: '20251201_01',
        availableVersions: ['20251201_01'],
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
        version: '20251201_01',
        availableVersions: ['20251201_01'],
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

    it('should transform file_uploadable properties inside anyOf', async () => {
      const schema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        version: '20251201_01',
        availableVersions: ['20251201_01'],
        inputParameters: {
          type: 'object',
          properties: {
            fileInput: {
              anyOf: [
                {
                  type: 'string',
                  file_uploadable: true,
                  description: 'File path',
                },
                {
                  type: 'null',
                },
              ],
            },
            text: {
              type: 'string',
            },
          },
        },
      };

      const result = await fileToolModifier.modifyToolSchema('test-tool', 'test-toolkit', schema);
      expect(result.inputParameters?.properties?.fileInput?.anyOf?.[0]).toHaveProperty(
        'format',
        'path'
      );
      expect(result.inputParameters?.properties?.fileInput?.anyOf?.[0]).toHaveProperty(
        'file_uploadable',
        true
      );
      expect(result.inputParameters?.properties?.fileInput?.anyOf?.[1]).not.toHaveProperty(
        'format'
      );
      expect(result.inputParameters?.properties?.text).not.toHaveProperty('format');
    });

    it('should transform file_uploadable properties inside oneOf', async () => {
      const schema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        version: '20251201_01',
        availableVersions: ['20251201_01'],
        inputParameters: {
          type: 'object',
          properties: {
            fileInput: {
              oneOf: [
                {
                  type: 'string',
                  file_uploadable: true,
                  title: 'Upload File',
                },
                {
                  type: 'string',
                  description: 'URL reference',
                },
              ],
            },
          },
        },
      };

      const result = await fileToolModifier.modifyToolSchema('test-tool', 'test-toolkit', schema);
      expect(result.inputParameters?.properties?.fileInput?.oneOf?.[0]).toHaveProperty(
        'format',
        'path'
      );
      expect(result.inputParameters?.properties?.fileInput?.oneOf?.[0]).toHaveProperty(
        'file_uploadable',
        true
      );
      expect(result.inputParameters?.properties?.fileInput?.oneOf?.[1]).not.toHaveProperty(
        'format'
      );
    });

    it('should transform file_uploadable properties inside allOf', async () => {
      const schema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        version: '20251201_01',
        availableVersions: ['20251201_01'],
        inputParameters: {
          type: 'object',
          properties: {
            fileInput: {
              allOf: [
                {
                  type: 'string',
                  file_uploadable: true,
                },
                {
                  minLength: 1,
                },
              ],
            },
          },
        },
      };

      const result = await fileToolModifier.modifyToolSchema('test-tool', 'test-toolkit', schema);
      expect(result.inputParameters?.properties?.fileInput?.allOf?.[0]).toHaveProperty(
        'format',
        'path'
      );
      expect(result.inputParameters?.properties?.fileInput?.allOf?.[0]).toHaveProperty(
        'file_uploadable',
        true
      );
      expect(result.inputParameters?.properties?.fileInput?.allOf?.[1]).not.toHaveProperty(
        'format'
      );
    });

    it('should transform nested file_uploadable properties inside anyOf with objects', async () => {
      const schema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        version: '20251201_01',
        availableVersions: ['20251201_01'],
        inputParameters: {
          type: 'object',
          properties: {
            content: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    attachment: {
                      type: 'string',
                      file_uploadable: true,
                    },
                  },
                },
                {
                  type: 'string',
                },
              ],
            },
          },
        },
      };

      const result = await fileToolModifier.modifyToolSchema('test-tool', 'test-toolkit', schema);
      expect(
        result.inputParameters?.properties?.content?.anyOf?.[0]?.properties?.attachment
      ).toHaveProperty('format', 'path');
      expect(
        result.inputParameters?.properties?.content?.anyOf?.[0]?.properties?.attachment
      ).toHaveProperty('file_uploadable', true);
    });

    it('should transform file_uploadable properties inside array items with anyOf', async () => {
      const schema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        version: '20251201_01',
        availableVersions: ['20251201_01'],
        inputParameters: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                anyOf: [
                  {
                    type: 'string',
                    file_uploadable: true,
                  },
                  {
                    type: 'null',
                  },
                ],
              },
            },
          },
        },
      };

      const result = await fileToolModifier.modifyToolSchema('test-tool', 'test-toolkit', schema);
      expect(result.inputParameters?.properties?.files?.items?.anyOf?.[0]).toHaveProperty(
        'format',
        'path'
      );
      expect(result.inputParameters?.properties?.files?.items?.anyOf?.[0]).toHaveProperty(
        'file_uploadable',
        true
      );
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
      version: '20251201_01',
      availableVersions: ['20251201_01'],
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

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith('/path/to/file.txt', {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });
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

    it('should handle File object for file_uploadable parameters', async () => {
      const mockFileData = {
        name: 'file.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/file.txt',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      const fileObject = new File(['test content'], 'file.txt', { type: 'text/plain' });
      const params = {
        arguments: {
          file: fileObject,
          text: 'some text',
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(mockTool, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith(fileObject, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });
      expect(result.arguments?.file).toEqual(mockFileData);
      expect(result.arguments?.text).toBe('some text');
    });

    it('should upload file for file_uploadable inside anyOf schema', async () => {
      const mockFileData = {
        name: 'file.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/file.txt',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      const toolWithAnyOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          properties: {
            fileInput: {
              anyOf: [
                {
                  type: 'string',
                  file_uploadable: true,
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const params = {
        arguments: {
          fileInput: '/path/to/file.txt',
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(toolWithAnyOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith('/path/to/file.txt', {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });
      expect(result.arguments?.fileInput).toEqual(mockFileData);
    });

    it('should upload file for file_uploadable inside oneOf schema', async () => {
      const mockFileData = {
        name: 'file.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/file.txt',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      const toolWithOneOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          properties: {
            fileInput: {
              oneOf: [
                {
                  type: 'string',
                  file_uploadable: true,
                },
                {
                  type: 'string',
                  description: 'URL',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const params = {
        arguments: {
          fileInput: '/path/to/file.txt',
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(toolWithOneOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith('/path/to/file.txt', {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });
      expect(result.arguments?.fileInput).toEqual(mockFileData);
    });

    it('should upload file for file_uploadable inside allOf schema', async () => {
      const mockFileData = {
        name: 'file.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/file.txt',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      const toolWithAllOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          properties: {
            fileInput: {
              allOf: [
                {
                  type: 'string',
                  file_uploadable: true,
                },
                {
                  minLength: 1,
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const params = {
        arguments: {
          fileInput: '/path/to/file.txt',
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(toolWithAllOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith('/path/to/file.txt', {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });
      expect(result.arguments?.fileInput).toEqual(mockFileData);
    });

    it('should upload file for nested file_uploadable inside anyOf with objects', async () => {
      const mockFileData = {
        name: 'attachment.pdf',
        mimetype: 'application/pdf',
        s3key: 'uploads/attachment.pdf',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      const toolWithNestedAnyOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          properties: {
            content: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    attachment: {
                      type: 'string',
                      file_uploadable: true,
                    },
                  },
                },
                {
                  type: 'string',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const params = {
        arguments: {
          content: {
            attachment: '/path/to/attachment.pdf',
          },
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(toolWithNestedAnyOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith(
        '/path/to/attachment.pdf',
        {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          client: mockClient,
        }
      );
      expect((result.arguments?.content as Record<string, unknown>)?.attachment).toEqual(
        mockFileData
      );
    });

    it('should not upload when value is null for anyOf with null variant', async () => {
      const toolWithAnyOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          properties: {
            fileInput: {
              anyOf: [
                {
                  type: 'string',
                  file_uploadable: true,
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const params = {
        arguments: {
          fileInput: null,
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(toolWithAnyOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).not.toHaveBeenCalled();
      expect(result.arguments?.fileInput).toBeNull();
    });

    it('should upload file from base properties when anyOf has no file_uploadable', async () => {
      const mockFileData = {
        name: 'file.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/file.txt',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      // Schema with anyOf at property level (no file_uploadable) but file_uploadable in sibling property
      const toolWithMixedSchema: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          properties: {
            metadata: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
            },
            file: {
              type: 'string',
              file_uploadable: true,
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const params = {
        arguments: {
          metadata: 'some metadata',
          file: '/path/to/file.txt',
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(toolWithMixedSchema, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith('/path/to/file.txt', {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        client: mockClient,
      });
      expect(result.arguments?.file).toEqual(mockFileData);
      expect(result.arguments?.metadata).toBe('some metadata');
    });

    it('should upload file when schema has anyOf without file_uploadable alongside properties with file_uploadable', async () => {
      const mockFileData = {
        name: 'document.pdf',
        mimetype: 'application/pdf',
        s3key: 'uploads/document.pdf',
      };
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue(mockFileData);

      // Schema where the root has both anyOf (without file_uploadable) and properties (with file_uploadable)
      const toolWithAnyOfAndProperties: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        inputParameters: {
          type: 'object',
          anyOf: [{ required: ['text'] }, { required: ['file'] }],
          properties: {
            text: {
              type: 'string',
            },
            file: {
              type: 'string',
              file_uploadable: true,
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const params = {
        arguments: {
          file: '/path/to/document.pdf',
        },
        userId: 'test-user',
      };

      const result = await fileToolModifier.fileUploadModifier(toolWithAnyOfAndProperties, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        params,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).toHaveBeenCalledWith(
        '/path/to/document.pdf',
        {
          toolSlug: 'test-tool',
          toolkitSlug: 'test-toolkit',
          client: mockClient,
        }
      );
      expect(result.arguments?.file).toEqual(mockFileData);
    });
  });

  describe('fileDownloadModifier', () => {
    const mockTool: Tool = {
      slug: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      tags: ['test'],
      availableVersions: ['20251201_01'],
      version: '20251201_01',
    };

    it('should download file from S3 URL', async () => {
      const mockDownloadResult = {
        name: 'file.txt',
        mimeType: 'text/plain',
        s3Url: 'downloads/file.txt',
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

    it('should download file with file_downloadable inside anyOf schema', async () => {
      const mockDownloadResult = {
        name: 'file.txt',
        mimeType: 'text/plain',
        s3Url: 'downloads/file.txt',
        filePath: '/downloaded/file.txt',
      };
      vi.mocked(fileUtils.downloadFileFromS3).mockResolvedValue(mockDownloadResult);

      const toolWithAnyOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        outputParameters: {
          type: 'object',
          properties: {
            fileOutput: {
              anyOf: [
                {
                  type: 'object',
                  file_downloadable: true,
                  properties: {
                    s3url: { type: 'string' },
                    mimetype: { type: 'string' },
                  },
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const result = {
        data: {
          fileOutput: {
            s3url: 'https://s3.example.com/file.txt',
            mimetype: 'text/plain',
          },
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(toolWithAnyOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).toHaveBeenCalledWith({
        toolSlug: 'test-tool',
        s3Url: 'https://s3.example.com/file.txt',
        mimeType: 'text/plain',
      });

      expect(modifiedResult.data.fileOutput).toEqual({
        uri: '/downloaded/file.txt',
        file_downloaded: true,
        s3url: 'https://s3.example.com/file.txt',
        mimeType: 'text/plain',
      });
    });

    it('should download file with file_downloadable inside oneOf schema', async () => {
      const mockDownloadResult = {
        name: 'document.pdf',
        mimeType: 'application/pdf',
        s3Url: 'downloads/document.pdf',
        filePath: '/downloaded/document.pdf',
      };
      vi.mocked(fileUtils.downloadFileFromS3).mockResolvedValue(mockDownloadResult);

      const toolWithOneOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        outputParameters: {
          type: 'object',
          properties: {
            result: {
              oneOf: [
                {
                  type: 'object',
                  file_downloadable: true,
                  properties: {
                    s3url: { type: 'string' },
                    mimetype: { type: 'string' },
                  },
                },
                {
                  type: 'string',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const result = {
        data: {
          result: {
            s3url: 'https://s3.example.com/document.pdf',
            mimetype: 'application/pdf',
          },
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(toolWithOneOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).toHaveBeenCalledWith({
        toolSlug: 'test-tool',
        s3Url: 'https://s3.example.com/document.pdf',
        mimeType: 'application/pdf',
      });

      expect(modifiedResult.data.result).toEqual({
        uri: '/downloaded/document.pdf',
        file_downloaded: true,
        s3url: 'https://s3.example.com/document.pdf',
        mimeType: 'application/pdf',
      });
    });

    it('should download file with file_downloadable inside allOf schema', async () => {
      const mockDownloadResult = {
        name: 'image.png',
        mimeType: 'image/png',
        s3Url: 'downloads/image.png',
        filePath: '/downloaded/image.png',
      };
      vi.mocked(fileUtils.downloadFileFromS3).mockResolvedValue(mockDownloadResult);

      const toolWithAllOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        outputParameters: {
          type: 'object',
          properties: {
            image: {
              allOf: [
                {
                  type: 'object',
                  file_downloadable: true,
                  properties: {
                    s3url: { type: 'string' },
                    mimetype: { type: 'string' },
                  },
                },
                {
                  required: ['s3url'],
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const result = {
        data: {
          image: {
            s3url: 'https://s3.example.com/image.png',
            mimetype: 'image/png',
          },
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(toolWithAllOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).toHaveBeenCalledWith({
        toolSlug: 'test-tool',
        s3Url: 'https://s3.example.com/image.png',
        mimeType: 'image/png',
      });

      expect(modifiedResult.data.image).toEqual({
        uri: '/downloaded/image.png',
        file_downloaded: true,
        s3url: 'https://s3.example.com/image.png',
        mimeType: 'image/png',
      });
    });

    it('should download nested file with file_downloadable inside anyOf with objects', async () => {
      const mockDownloadResult = {
        name: 'attachment.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        s3Url: 'downloads/attachment.docx',
        filePath: '/downloaded/attachment.docx',
      };
      vi.mocked(fileUtils.downloadFileFromS3).mockResolvedValue(mockDownloadResult);

      const toolWithNestedAnyOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        outputParameters: {
          type: 'object',
          properties: {
            response: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    attachment: {
                      type: 'object',
                      file_downloadable: true,
                      properties: {
                        s3url: { type: 'string' },
                        mimetype: { type: 'string' },
                      },
                    },
                  },
                },
                {
                  type: 'string',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const result = {
        data: {
          response: {
            attachment: {
              s3url: 'https://s3.example.com/attachment.docx',
              mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
          },
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(toolWithNestedAnyOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).toHaveBeenCalledWith({
        toolSlug: 'test-tool',
        s3Url: 'https://s3.example.com/attachment.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      expect((modifiedResult.data.response as Record<string, unknown>)?.attachment).toEqual({
        uri: '/downloaded/attachment.docx',
        file_downloaded: true,
        s3url: 'https://s3.example.com/attachment.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    });

    it('should download files in array with anyOf schema', async () => {
      const mockDownloadResult = {
        name: 'file.txt',
        mimeType: 'text/plain',
        s3Url: 'downloads/file.txt',
        filePath: '/downloaded/file.txt',
      };
      vi.mocked(fileUtils.downloadFileFromS3).mockResolvedValue(mockDownloadResult);

      const toolWithArrayAnyOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        outputParameters: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                anyOf: [
                  {
                    type: 'object',
                    file_downloadable: true,
                    properties: {
                      s3url: { type: 'string' },
                      mimetype: { type: 'string' },
                    },
                  },
                  {
                    type: 'null',
                  },
                ],
              },
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const result = {
        data: {
          files: [
            {
              s3url: 'https://s3.example.com/file1.txt',
              mimetype: 'text/plain',
            },
            {
              s3url: 'https://s3.example.com/file2.txt',
              mimetype: 'text/plain',
            },
          ],
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(toolWithArrayAnyOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).toHaveBeenCalledTimes(2);
      expect((modifiedResult.data.files as unknown[])?.[0]).toEqual({
        uri: '/downloaded/file.txt',
        file_downloaded: true,
        s3url: 'https://s3.example.com/file1.txt',
        mimeType: 'text/plain',
      });
    });

    it('should not download when value is null for anyOf with null variant', async () => {
      const toolWithAnyOf: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        tags: ['test'],
        outputParameters: {
          type: 'object',
          properties: {
            fileOutput: {
              anyOf: [
                {
                  type: 'object',
                  file_downloadable: true,
                  properties: {
                    s3url: { type: 'string' },
                    mimetype: { type: 'string' },
                  },
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        version: '20251201_01',
        availableVersions: ['20251201_01'],
      };

      const result = {
        data: {
          fileOutput: null,
        },
        error: null,
        successful: true,
      };

      const modifiedResult = await fileToolModifier.fileDownloadModifier(toolWithAnyOf, {
        toolSlug: 'test-tool',
        toolkitSlug: 'test-toolkit',
        result,
      });

      expect(fileUtils.downloadFileFromS3).not.toHaveBeenCalled();
      expect(modifiedResult.data.fileOutput).toBeNull();
    });
  });
});

describe('Tools with autoUploadDownloadFiles', () => {
  const context = createTestContext();
  setupTest(context);

  const mockToolWithFileUpload: Tool = {
    slug: 'COMPOSIO_TOOL',
    name: 'Composio Tool',
    description: 'A test tool',
    tags: ['test'],
    toolkit: {
      slug: 'test-toolkit',
      name: 'Test Toolkit',
    },
    inputParameters: {
      type: 'object' as const,
      properties: {
        file: {
          type: 'string',
          file_uploadable: true,
        },
      },
      additionalProperties: false,
    },
    outputParameters: {
      type: 'object' as const,
      properties: {
        file: {
          type: 'object',
          properties: {
            s3url: {
              type: 'string',
            },
            mimetype: {
              type: 'string',
            },
          },
        },
      },
      additionalProperties: false,
    },
    version: '20251201_01',
    availableVersions: ['20251201_01'],
  };

  const mockRawToolWithFileUpload = {
    slug: 'COMPOSIO_TOOL',
    name: 'Composio Tool',
    description: 'A test tool',
    tags: ['test'],
    toolkit: {
      slug: 'test-toolkit',
      name: 'Test Toolkit',
    },
    input_parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          file_uploadable: true,
        },
      },
      additionalProperties: false,
    },
    output_parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'object',
          properties: {
            s3url: {
              type: 'string',
            },
            mimetype: {
              type: 'string',
            },
          },
        },
      },
      additionalProperties: false,
    },
    version: '20251201_01',
    availableVersions: ['20251201_01'],
  };

  describe('when autoUploadDownloadFiles is false', () => {
    beforeEach(async () => {
      context.tools = new Tools(mockClient as unknown as ComposioClient, {
        provider: context.mockProvider,
        autoUploadDownloadFiles: false,
      });

      // Mock the tool execution
      const { getRawComposioToolBySlugSpy } = await mockToolExecution(context.tools);
      getRawComposioToolBySlugSpy.mockReset();
      getRawComposioToolBySlugSpy.mockResolvedValue(mockToolWithFileUpload);

      // Mock the client's tools.list method
      mockClient.tools.list.mockResolvedValue({
        items: [mockRawToolWithFileUpload],
        totalPages: 1,
      });

      // Mock the file upload and download utilities
      vi.mocked(fileUtils.getFileDataAfterUploadingToS3).mockResolvedValue({
        name: 'file.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/file.txt',
      });

      vi.mocked(fileUtils.downloadFileFromS3).mockResolvedValue({
        name: 'file.txt',
        mimeType: 'text/plain',
        s3Url: 'downloads/file.txt',
        filePath: '/path/to/downloaded/file.txt',
      });

      // Mock the provider's wrapTools method
      context.mockProvider.wrapTools.mockImplementation(tools => tools);
    });

    it('should not modify tool schema for file upload', async () => {
      const result = await context.tools.getRawComposioTools({ tools: ['COMPOSIO_TOOL'] });
      expect(result[0].inputParameters?.properties?.file).not.toHaveProperty('format');
      expect(fileUtils.getFileDataAfterUploadingToS3).not.toHaveBeenCalled();
    });

    it('should not upload files during execution', async () => {
      // Mock getRawComposioToolBySlug for this test
      vi.spyOn(context.tools, 'getRawComposioToolBySlug').mockResolvedValueOnce(
        mockToolWithFileUpload
      );

      await context.tools.execute('COMPOSIO_TOOL', {
        arguments: {
          file: '/path/to/file.txt',
        },
        userId: 'test-user',
        dangerouslySkipVersionCheck: true,
      });

      expect(fileUtils.getFileDataAfterUploadingToS3).not.toHaveBeenCalled();
      expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
        arguments: {
          file: '/path/to/file.txt',
        },
        allow_tracing: undefined,
        connected_account_id: undefined,
        custom_auth_params: undefined,
        custom_connection_data: undefined,
        text: undefined,
        user_id: 'test-user',
        version: 'latest',
      });
    });

    it('should not download files from execution results', async () => {
      // Mock getRawComposioToolBySlug for this test
      vi.spyOn(context.tools, 'getRawComposioToolBySlug').mockResolvedValueOnce(
        mockToolWithFileUpload
      );

      // Mock the response data structure correctly
      const mockResponse = {
        data: {
          file: {
            s3url: 'https://s3.example.com/file.txt',
            mimetype: 'text/plain',
          },
        },
        error: null,
        successful: true,
        log_id: '123',
        session_info: {},
      };

      // Mock the client's execute method to return the raw response
      mockClient.tools.execute.mockResolvedValueOnce(mockResponse);

      // Mock transformToolExecuteResponse to return the same data structure
      vi.spyOn(context.tools as any, 'transformToolExecuteResponse').mockReturnValue({
        data: mockResponse.data,
        error: mockResponse.error,
        successful: mockResponse.successful,
        logId: mockResponse.log_id,
        sessionInfo: mockResponse.session_info,
      });

      const result = await context.tools.execute('COMPOSIO_TOOL', {
        arguments: {
          file: '/path/to/file.txt',
        },
        userId: 'test-user',
        dangerouslySkipVersionCheck: true,
      });

      expect(fileUtils.downloadFileFromS3).not.toHaveBeenCalled();
      expect(result.data.file).toEqual({
        s3url: 'https://s3.example.com/file.txt',
        mimetype: 'text/plain',
      });
    });
  });
});
