import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import ComposioClient, { APIUserAbortError } from '@composio/client';
import { Files } from '../../src/models/Files.node';
import { ComposioRequestCancelledError } from '../../src/errors/SDKErrors';

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

// The SSRF guard resolves every S3 host before fetching it; resolve the test
// hosts to a public address so no lookup leaves the process.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * A transfer that only ends when its signal aborts, rejecting with the
 * signal's reason the way `fetch` does. A call that drops the caller's signal
 * fails at once instead of hanging the test.
 */
const transferUntilAborted = (_url: string, init?: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error('fetch was called without the caller signal'));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

/**
 * A download whose headers arrive at once but whose body stalls after the
 * first chunk. Like `fetch`, the body stream fails with the signal's reason
 * when the signal aborts. `bodyRead` reports when the SDK has started reading.
 */
const responseWithStalledBody = () => {
  const state = { bodyRead: false };
  const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal;
    if (!signal) {
      return Promise.reject(new Error('fetch was called without the caller signal'));
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      },
      pull(controller) {
        if (state.bodyRead) {
          return new Promise<void>(() => {});
        }
        state.bodyRead = true;
        controller.enqueue(new Uint8Array(4));
      },
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { state, fetchImpl };
};

const uploadParams = {
  file: new File(['report contents'], 'report.txt', { type: 'text/plain' }),
  toolSlug: 'GOOGLEDRIVE_UPLOAD_FILE',
  toolkitSlug: 'googledrive',
};

const downloadParams = {
  s3Url: 'https://s3.example.com/report.pdf',
  toolSlug: 'GOOGLEDRIVE_DOWNLOAD_FILE',
  mimeType: 'application/pdf',
};

describe('Files request cancellation', () => {
  let createPresignedURL: ReturnType<typeof vi.fn>;
  let files: Files;

  beforeEach(() => {
    vi.clearAllMocks();
    createPresignedURL = vi.fn().mockResolvedValue({
      key: 'uploads/report.txt',
      type: 'new',
      new_presigned_url: 'https://s3.example.com/upload',
    });
    const client = { files: { createPresignedURL } } as unknown as ComposioClient;
    files = new Files(client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('upload', () => {
    it('sends the caller signal with the presigned-URL request and the S3 transfer', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

      await expect(files.upload(uploadParams, { signal: controller.signal })).resolves.toEqual({
        name: 'report.txt',
        mimetype: 'text/plain',
        s3key: 'uploads/report.txt',
      });

      expect(createPresignedURL).toHaveBeenCalledWith(expect.any(Object), {
        signal: controller.signal,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://s3.example.com/upload',
        expect.objectContaining({ method: 'PUT', signal: controller.signal })
      );
    });

    it('rejects with ComposioRequestCancelledError when aborted during the S3 transfer', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce(transferUntilAborted);

      const upload = files.upload(uploadParams, { signal: controller.signal });
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
      controller.abort();

      await expect(upload).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    });

    it('rejects with ComposioRequestCancelledError when aborted during the presigned-URL request', async () => {
      createPresignedURL.mockRejectedValueOnce(new APIUserAbortError());

      await expect(
        files.upload(uploadParams, { signal: AbortSignal.abort() })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects with ComposioRequestCancelledError when an AbortSignal.timeout fires', async () => {
      mockFetch.mockImplementationOnce(transferUntilAborted);

      await expect(
        files.upload(uploadParams, { signal: AbortSignal.timeout(10) })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    });

    it('rejects with ComposioRequestCancelledError when aborted while reading a URL', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce(transferUntilAborted);

      const upload = files.upload(
        { ...uploadParams, file: 'https://files.example.com/report.pdf' },
        { signal: controller.signal }
      );
      await vi.waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          'https://files.example.com/report.pdf',
          expect.objectContaining({ signal: controller.signal })
        )
      );
      controller.abort();

      await expect(upload).rejects.toBeInstanceOf(ComposioRequestCancelledError);
      expect(createPresignedURL).not.toHaveBeenCalled();
    });

    it('keeps a failure that is not an abort as-is', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 403, statusText: 'Forbidden' }));

      await expect(
        files.upload(uploadParams, { signal: new AbortController().signal })
      ).rejects.toThrow('Failed to upload file to S3: Forbidden');
    });
  });

  describe('download', () => {
    it('rejects with ComposioRequestCancelledError and writes nothing when aborted', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce(transferUntilAborted);

      const download = files.download(downloadParams, { signal: controller.signal });
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
      controller.abort();

      await expect(download).rejects.toBeInstanceOf(ComposioRequestCancelledError);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('rejects with ComposioRequestCancelledError when an AbortSignal.timeout fires', async () => {
      mockFetch.mockImplementationOnce(transferUntilAborted);

      await expect(
        files.download(downloadParams, { signal: AbortSignal.timeout(10) })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('rejects with ComposioRequestCancelledError and writes nothing when aborted while reading the body', async () => {
      const controller = new AbortController();
      const { state, fetchImpl } = responseWithStalledBody();
      mockFetch.mockImplementationOnce(fetchImpl);

      const download = files.download(downloadParams, { signal: controller.signal });
      await vi.waitFor(() => expect(state.bodyRead).toBe(true));
      controller.abort();

      await expect(download).rejects.toBeInstanceOf(ComposioRequestCancelledError);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('rejects with ComposioRequestCancelledError when aborted with a custom reason', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce(transferUntilAborted);

      const download = files.download(downloadParams, { signal: controller.signal });
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
      controller.abort('caller gave up');

      const error = await download.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ComposioRequestCancelledError);
      expect((error as Error).message).toBe('Request was cancelled by the caller');
      expect((error as Error).cause).toBeUndefined();
    });

    it('downloads the file when the signal does not abort', async () => {
      mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(8), { status: 200 }));

      const result = await files.download(downloadParams, {
        signal: new AbortController().signal,
      });

      expect(result.s3Url).toBe(downloadParams.s3Url);
      expect(fs.writeFileSync).toHaveBeenCalledOnce();
    });
  });
});
