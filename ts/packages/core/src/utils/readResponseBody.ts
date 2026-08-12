/** Maximum size accepted for files fetched from user-supplied URLs (100 MiB). */
export const MAX_URL_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

const sizeLimitError = (actualSize: number, maxBytes: number): Error =>
  new Error(`File size (${actualSize} bytes) exceeds maximum allowed size (${maxBytes} bytes)`);

/**
 * Read a fetch response without allowing an untrusted server to exhaust memory.
 *
 * `Content-Length` is checked as an early rejection, but the streamed byte
 * count is authoritative because the header can be absent or dishonest.
 */
export const readResponseBodyWithLimit = async (
  response: Response,
  maxBytes: number = MAX_URL_UPLOAD_SIZE_BYTES
): Promise<Uint8Array> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }

  const contentLength = response.headers.get('content-length')?.trim();
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredSize = Number(contentLength);
    if (!Number.isSafeInteger(declaredSize) || declaredSize > maxBytes) {
      const error = sizeLimitError(declaredSize, maxBytes);
      await response.body?.cancel(error).catch(() => undefined);
      throw error;
    }
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel(sizeLimitError(totalBytes, maxBytes));
        throw sizeLimitError(totalBytes, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};
