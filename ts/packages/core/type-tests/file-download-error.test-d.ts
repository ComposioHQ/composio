import type { Equal, Expect } from '@type-challenges/utils';
import type { ComposioFileDownloadError } from '../src';

export type DownloadErrorStatusCode = Expect<
  Equal<ComposioFileDownloadError['statusCode'], number | undefined>
>;

export type DownloadErrorMetadata = Expect<
  Equal<ComposioFileDownloadError['meta'], Record<string, unknown> | undefined>
>;

export type DownloadErrorCause = Expect<Equal<ComposioFileDownloadError['cause'], unknown>>;
