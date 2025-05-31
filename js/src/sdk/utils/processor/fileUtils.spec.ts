import { readFileContent, getFileDataAfterUploadingToS3 } from './fileUtils';
import { processFileUpload } from './file';
import { Client } from '@hey-api/client-axios';

// Mock the fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockImplementation((path) => {
    if (path === 'validPath.txt') {
      return Buffer.from('test content');
    }
    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  }),
}));

// Mock the axios module
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    data: Buffer.from('test content'),
    headers: { 'content-type': 'text/plain' },
  }),
  put: jest.fn().mockResolvedValue({}),
}));

// Mock apiClient
jest.mock('../../../client/client', () => ({
  actionsV2: {
    createFileUploadUrl: jest.fn().mockResolvedValue({
      data: { url: 'https://example.com/upload', key: 'test-key' },
    }),
  },
}));

describe('File Utils Validation', () => {
  describe('readFileContent', () => {
    it('should throw a friendly error for empty file paths', async () => {
      await expect(readFileContent('')).rejects.toThrow('File path cannot be empty');
    });

    it('should throw a friendly error for whitespace-only file paths', async () => {
      await expect(readFileContent('   ')).rejects.toThrow('File path cannot be empty');
    });

    it('should process valid file paths correctly', async () => {
      const result = await readFileContent('validPath.txt');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('mimeType');
    });
  });

  describe('getFileDataAfterUploadingToS3', () => {
    const mockClient = { apiKey: 'test-key' } as Client;
    
    it('should throw a friendly error for empty file paths', async () => {
      await expect(getFileDataAfterUploadingToS3('', 'testAction', mockClient)).rejects.toThrow('File path cannot be empty');
    });

    it('should throw a friendly error for whitespace-only file paths', async () => {
      await expect(getFileDataAfterUploadingToS3('   ', 'testAction', mockClient)).rejects.toThrow('File path cannot be empty');
    });
  });

  describe('processFileUpload', () => {
    const mockClient = { apiKey: 'test-key' } as Client;
    
    it('should throw a friendly error for empty file paths', async () => {
      const params = {
        'test_schema_parsed_file': '',
      };
      await expect(processFileUpload(params, 'testAction', mockClient)).rejects.toThrow('File path cannot be empty');
    });

    it('should throw a friendly error for whitespace-only file paths', async () => {
      const params = {
        'test_schema_parsed_file': '   ',
      };
      await expect(processFileUpload(params, 'testAction', mockClient)).rejects.toThrow('File path cannot be empty');
    });
  });
});
