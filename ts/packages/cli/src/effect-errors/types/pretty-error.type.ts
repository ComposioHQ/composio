import type { ErrorSpan } from './error-span.type';

export class PrettyError {
  constructor(
    readonly message: unknown,
    readonly stack: string | undefined,
    readonly spans: ReadonlyArray<ErrorSpan>,
    readonly isPlainString: boolean,
    readonly errorType?: unknown
  ) {}
}
