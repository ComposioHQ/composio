import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const SsrfErrorCodes = {
  BLOCKED_INTERNAL_URL: 'BLOCKED_INTERNAL_URL',
} as const;

export interface ComposioBlockedInternalUrlErrorOptions extends Omit<ComposioErrorOptions, 'code'> {
  /** The user-supplied URL that was refused. */
  url?: string;
  /** The resolved address that tripped the guard, when known. */
  resolvedIp?: string;
}

/**
 * Thrown when a URL file input resolves to a private, loopback, link-local, or
 * otherwise internal address, or points at a non-http(s) scheme. Guards against
 * turning `composio.files.upload(url)` (and automatic upload during tool
 * execution) into a server-side request forgery (SSRF) probe of internal
 * infrastructure such as cloud metadata endpoints (`169.254.169.254`).
 */
export class ComposioBlockedInternalUrlError extends ComposioError {
  constructor(
    message: string = 'Refusing to fetch an internal or non-public URL',
    options: ComposioBlockedInternalUrlErrorOptions = {}
  ) {
    const { url, resolvedIp, meta: optionsMeta, ...rest } = options;

    const meta: Record<string, unknown> = {
      ...optionsMeta,
      ...(url && { url }),
      ...(resolvedIp && { resolvedIp }),
    };

    super(message, {
      ...rest,
      code: SsrfErrorCodes.BLOCKED_INTERNAL_URL,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
      possibleFixes: options.possibleFixes ?? [
        'Use a publicly reachable http(s) URL',
        'Do not point file inputs at localhost, link-local, or private-network hosts',
        'If the source is internal, download it yourself and pass a File/Blob instead of a URL',
      ],
    });

    this.name = 'ComposioBlockedInternalUrlError';
  }
}
