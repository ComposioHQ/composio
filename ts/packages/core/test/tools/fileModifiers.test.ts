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
      context.tools = new Tools(mockClient as unknown as ComposioClient, context.mockProvider, {
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
