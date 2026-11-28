/** Maximum size accepted for files fetched from user-supplied URLs (100 MiB). */
export const MAX_URL_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

const sizeLimitError = (actualSize: number, maxBytes: number): Error =>
  new Error(`File size (${actualSize} bytes) exceeds maximum allowed size (${maxBytes} bytes)`);

export const assertValidBodyLimit = (maxBytes: number): void => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }
};

/**
 * Read a Fetch request or response within a byte limit.
 *
 * `Content-Length` is checked as an early rejection, but the streamed byte
 * count is authoritative because the header can be absent or dishonest.
 */
export const readBodyWithLimit = async (
  { body, headers }: Pick<Response, 'body' | 'headers'>,
  maxBytes: number,
  makeSizeLimitError: (actualSize: number, maxBytes: number) => Error
): Promise<Uint8Array> => {
  assertValidBodyLimit(maxBytes);

  const contentLength = headers.get('content-length')?.trim();
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredSize = Number(contentLength);
    if (!Number.isSafeInteger(declaredSize) || declaredSize > maxBytes) {
      const error = makeSizeLimitError(declaredSize, maxBytes);
      void body?.cancel(error).catch(() => undefined);
      throw error;
    }
  }

  if (!body) {
    return new Uint8Array();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        const error = makeSizeLimitError(totalBytes, maxBytes);
        // A cloned request can keep the cancellation pending on its other branch.
        void reader.cancel(error).catch(() => undefined);
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

/** Read a Fetch response within the file size limit. */
export const readResponseBodyWithLimit = (
  response: Response,
  maxBytes: number = MAX_URL_UPLOAD_SIZE_BYTES
): Promise<Uint8Array> => readBodyWithLimit(response, maxBytes, sizeLimitError);
