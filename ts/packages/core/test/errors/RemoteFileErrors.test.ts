import { describe, it, expect } from 'vitest';
import { ComposioError } from '../../src/errors/ComposioError';
import { RemoteFileDownloadError, RemoteFileErrorCodes } from '../../src/errors/RemoteFileErrors';

describe('RemoteFileDownloadError', () => {
  it('should create error with default message', () => {
    const err = new RemoteFileDownloadError();
    expect(err.message).toBe('Failed to download remote file');
    expect(err.name).toBe('RemoteFileDownloadError');
    expect(err.code).toContain(RemoteFileErrorCodes.DOWNLOAD_FAILED);
  });

  it('should create error with custom message and options', () => {
    const err = new RemoteFileDownloadError('Download failed: 404', {
      statusCode: 404,
      statusText: 'Not Found',
      downloadUrl: 'https://example.com/file',
      mountRelativePath: 'output/report.pdf',
      filename: 'report.pdf',
    });

    expect(err.message).toBe('Download failed: 404');
    expect(err.code).toContain(RemoteFileErrorCodes.DOWNLOAD_FAILED);
    expect(err.meta).toMatchObject({
      statusCode: 404,
      statusText: 'Not Found',
      downloadUrl: 'https://example.com/file',
      mountRelativePath: 'output/report.pdf',
      filename: 'report.pdf',
    });
    expect(err.possibleFixes).toBeDefined();
    expect(err.possibleFixes).toContain(
      'Verify the download URL has not expired (check expiresAt)'
    );
  });

  it('should extend ComposioError', () => {
    const err = new RemoteFileDownloadError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ComposioError);
    expect(err).toBeInstanceOf(RemoteFileDownloadError);
  });
});
