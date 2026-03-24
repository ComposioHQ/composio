import {
  extractApiErrorDetails,
  extractMessage,
  extractSlug,
  type ApiErrorDetails,
} from 'src/utils/api-error-extraction';

const NO_CONNECTION_SLUGS: ReadonlySet<string> = new Set([
  'ActionExecute_ConnectedAccountNotFound',
  'ToolRouterV2_NoActiveConnection',
]);

const extractNestedDetails = (value: unknown): unknown => {
  let current: unknown = value;
  const seen = new Set<unknown>();

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    if ('details' in current) {
      const details = (current as { details?: unknown }).details;
      if (details !== undefined) {
        return details;
      }
    }

    if ('error' in current) {
      current = (current as { error?: unknown }).error;
      continue;
    }
    if ('cause' in current) {
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    break;
  }

  return undefined;
};

export const normalizeCliError = (error: unknown): unknown => {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      return current;
    }

    if ('error' in current) {
      current = (current as { error?: unknown }).error;
      continue;
    }
    if ('cause' in current) {
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    break;
  }

  return current;
};

export const isNoConnectionSlug = (slug: string | undefined | null): boolean =>
  slug != null && NO_CONNECTION_SLUGS.has(slug);

export const isNoActiveConnectionApiError = (
  details: { code?: number; slug?: string } | undefined
): boolean => details?.code === 4302 || isNoConnectionSlug(details?.slug);

export const buildNoActiveConnectionMessage = (params: {
  readonly toolkit?: string;
  readonly toolSlug?: string;
}) => {
  if (params.toolkit) {
    return `No active connection found for toolkit "${params.toolkit}". Run \`composio link ${params.toolkit}\`, then retry.`;
  }
  if (params.toolSlug) {
    const idx = params.toolSlug.indexOf('_');
    const toolkit =
      idx <= 0 ? params.toolSlug.toLowerCase() : params.toolSlug.slice(0, idx).toLowerCase();
    if (toolkit !== 'composio') {
      return `No active connection found for toolkit "${toolkit}". Run \`composio link ${toolkit}\`, then retry.`;
    }
  }
  return 'No active connection found for this tool call. Link the required toolkit/app, then retry.';
};

export class ComposioNoActiveConnectionError extends Error {
  readonly details: unknown;
  readonly apiDetails?: ApiErrorDetails;
  readonly toolkit?: string;
  readonly toolSlug?: string;

  constructor(params: {
    readonly details: unknown;
    readonly apiDetails?: ApiErrorDetails;
    readonly toolkit?: string;
    readonly toolSlug?: string;
  }) {
    super(
      buildNoActiveConnectionMessage({
        toolkit: params.toolkit,
        toolSlug: params.toolSlug,
      })
    );
    this.name = 'ComposioNoActiveConnectionError';
    this.details = params.details;
    this.apiDetails = params.apiDetails;
    this.toolkit = params.toolkit;
    this.toolSlug = params.toolSlug;
  }
}

export const mapComposioError = (params: {
  readonly error: unknown;
  readonly toolkit?: string;
  readonly toolSlug?: string;
}) => {
  const normalized = normalizeCliError(params.error);
  const nestedDetails = extractNestedDetails(params.error) ?? extractNestedDetails(normalized);
  const apiDetails =
    extractApiErrorDetails(params.error) ??
    extractApiErrorDetails(nestedDetails) ??
    extractApiErrorDetails(normalized) ??
    (normalized instanceof ComposioNoActiveConnectionError ? normalized.apiDetails : undefined);
  const slugValue =
    apiDetails?.slug ??
    extractSlug(nestedDetails) ??
    extractSlug(params.error) ??
    extractSlug(normalized) ??
    (normalized instanceof ComposioNoActiveConnectionError
      ? normalized.apiDetails?.slug
      : undefined);

  if (
    normalized instanceof ComposioNoActiveConnectionError ||
    isNoActiveConnectionApiError(apiDetails) ||
    isNoConnectionSlug(slugValue)
  ) {
    const mapped =
      normalized instanceof ComposioNoActiveConnectionError
        ? normalized
        : new ComposioNoActiveConnectionError({
            details: apiDetails ?? params.error,
            apiDetails,
            toolkit: params.toolkit,
            toolSlug: params.toolSlug,
          });

    return {
      normalized: mapped,
      apiDetails,
      slugValue,
      message: mapped.message,
      override: {
        kind: 'no_active_connection' as const,
        error: mapped,
      },
    };
  }

  return {
    normalized,
    apiDetails,
    slugValue,
    message:
      extractMessage(apiDetails) ??
      extractMessage(nestedDetails) ??
      extractMessage(normalized) ??
      'Unknown error',
    override: null,
  };
};

export const mapOnlyComposioOverrideError = (params: {
  readonly error: unknown;
  readonly toolkit?: string;
  readonly toolSlug?: string;
}): unknown => {
  const mapped = mapComposioError(params);
  return mapped.override ? mapped.normalized : params.error;
};
