import { Effect } from 'effect';

/**
 * Metrics from API calls.
 */
export type Metrics = {
  readonly byteSize: number;
  readonly requests: number;
};

/**
 * Formats byte size into a human-readable string.
 * @param bytes - Number of bytes to format
 * @returns A string like "1.23 KB" or "456 B"
 */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

/**
 * Logs API metrics (request count and total bytes downloaded) at debug level.
 * @param metrics - The metrics to log
 * @returns An Effect that logs the metrics
 */
export const logMetrics = (metrics: Metrics): Effect.Effect<void> =>
  Effect.logDebug(
    `API metrics: ${metrics.requests} request(s), ${formatBytes(metrics.byteSize)} downloaded`
  );
