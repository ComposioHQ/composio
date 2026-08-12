import { Predicate } from 'effect';
import {
  extractApiErrorDetails,
  extractMessage,
  extractSlug,
  type ApiErrorDetails,
} from 'src/utils/api-error-extraction';
import { guessToolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';

const NO_CONNECTION_SLUGS: ReadonlySet<string> = new Set([
  'ActionExecute_ConnectedAccountNotFound',
  'ToolRouterV2_NoActiveConnection',
]);

/**
 * Provider error codes that mean the stored credential is no longer good.
 *
 * These do not arrive as Composio errors, because nothing in Composio failed: the call reached the
 * provider and the provider refused the credential. There is no error code, slug, or HTTP status to
 * key on — only the provider's own error string — and the connected account keeps whatever status
 * Composio last observed, so `composio connections list` reports `ACTIVE` for a grant the provider
 * has already thrown away. Classifying it here is what stops every caller from either printing the
 * raw provider string with no way forward or inventing a check that reports healthy.
 */
const PROVIDER_AUTH_FAILURE_CODES: ReadonlySet<string> = new Set([
  'account_inactive',
  'expired_token',
  'invalid_auth',
  'invalid_client',
  'invalid_grant',
  'invalid_token',
  'not_authed',
  'token_expired',
  'token_revoked',
  'unauthorized_client',
]);

/** Providers that answer in prose rather than a code, matched against the lowercased message. */
const PROVIDER_AUTH_FAILURE_PHRASES: ReadonlyArray<string> = [
  'bad credentials',
  'invalidauthenticationtoken',
  'token has been expired or revoked',
];

/**
 * Codes are matched as whole tokens, never as substrings. A message that merely contains the word
 * "revoked" — a scope description, a tool that lists revoked records — is not a revoked connection,
 * and telling someone to re-authorize when the real fault is elsewhere sends them through a browser
 * round trip that fixes nothing.
 */
export const isProviderAuthFailureMessage = (message: string): boolean => {
  const lowered = message.toLowerCase();
  return (
    PROVIDER_AUTH_FAILURE_PHRASES.some(phrase => lowered.includes(phrase)) ||
    lowered.split(/[^a-z0-9_]+/).some(token => PROVIDER_AUTH_FAILURE_CODES.has(token))
  );
};

const extractNestedDetails = (value: unknown): unknown => {
  let current: unknown = value;
  const seen = new Set<unknown>();

  while (Predicate.isObject(current) && !seen.has(current)) {
    seen.add(current);

    if (Predicate.hasProperty(current, 'details')) {
      const details = current.details;
      if (details !== undefined) {
        return details;
      }
    }

    if (Predicate.hasProperty(current, 'error')) {
      current = current.error;
      continue;
    }
    if (Predicate.hasProperty(current, 'cause')) {
      current = current.cause;
      continue;
    }
    break;
  }

  return undefined;
};

export const normalizeCliError = (error: unknown): unknown => {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (Predicate.isObject(current) && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      return current;
    }

    if (Predicate.hasProperty(current, 'error')) {
      current = current.error;
      continue;
    }
    if (Predicate.hasProperty(current, 'cause')) {
      current = current.cause;
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
    // Best-effort fallback for callers that could not resolve the toolkit.
    // `guessToolkitFromToolSlug` returns the whole slug lowercased when there
    // is no underscore, so keep the explicit 'composio' guard for the
    // bare-slug case.
    const toolkit = guessToolkitFromToolSlug(params.toolSlug);
    if (toolkit && toolkit !== 'composio') {
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

/**
 * The toolkit a remediation can name. `guessToolkitFromToolSlug` returns the whole slug lowercased when
 * there is no underscore, so a bare slug degrades to no toolkit rather than to `'composio'`.
 */
const remediationToolkit = (params: {
  readonly toolkit?: string;
  readonly toolSlug?: string;
}): string | undefined => {
  if (params.toolkit) return params.toolkit;
  if (!params.toolSlug) return undefined;
  const derived = guessToolkitFromToolSlug(params.toolSlug);
  return derived && derived !== 'composio' ? derived : undefined;
};

export const buildRevokedConnectionMessage = (params: {
  readonly toolkit?: string;
  readonly toolSlug?: string;
  readonly providerMessage: string;
}) => {
  const toolkit = remediationToolkit(params);
  // No command in the message. Reconnecting takes two steps in a specific order, and a one-line
  // error that names only `composio link` sends the reader at a command that refuses while the dead
  // account is still there. The steps belong in the note, which has room to say why.
  return toolkit
    ? `The ${toolkit} connection is no longer authorized (${params.providerMessage}). Reconnect it, then retry.`
    : `The connection for this tool call is no longer authorized (${params.providerMessage}). Reconnect the toolkit, then retry.`;
};

/**
 * The provider rejected a credential Composio still holds.
 *
 * Distinct from {@link ComposioNoActiveConnectionError}, which means Composio has no connection at
 * all. Here the connected account exists and reads `ACTIVE`; only the provider knows the grant is
 * dead. The two need different prose for exactly that reason — "no active connection found" would
 * contradict what `composio connections list` shows and read as a CLI bug.
 */
export class ComposioRevokedConnectionError extends Error {
  readonly details: unknown;
  readonly apiDetails?: ApiErrorDetails;
  readonly toolkit?: string;
  readonly toolSlug?: string;
  /** The provider's own wording, kept so the note can show the evidence for the diagnosis. */
  readonly providerMessage: string;

  constructor(params: {
    readonly details: unknown;
    readonly apiDetails?: ApiErrorDetails;
    readonly toolkit?: string;
    readonly toolSlug?: string;
    readonly providerMessage: string;
  }) {
    super(
      buildRevokedConnectionMessage({
        toolkit: params.toolkit,
        toolSlug: params.toolSlug,
        providerMessage: params.providerMessage,
      })
    );
    this.name = 'ComposioRevokedConnectionError';
    this.details = params.details;
    this.apiDetails = params.apiDetails;
    this.toolkit = params.toolkit;
    this.toolSlug = params.toolSlug;
    this.providerMessage = params.providerMessage;
  }
}

/**
 * Which remediable condition a failure was classified as, for callers that render their own
 * guidance instead of printing `message`. `composio onboard` is one: it has to tell a human what to
 * do next after a demo fails, and without this it can only guess from the rendered string.
 */
export type ComposioFailureReason = 'no_active_connection' | 'revoked_connection';

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

  const message =
    extractMessage(apiDetails) ??
    extractMessage(nestedDetails) ??
    extractMessage(normalized) ??
    'Unknown error';

  // Checked after the Composio-side branch above, which is authoritative: when Composio itself says
  // there is no connection, that is the diagnosis regardless of what any provider text says.
  if (
    normalized instanceof ComposioRevokedConnectionError ||
    isProviderAuthFailureMessage(message)
  ) {
    const mapped =
      normalized instanceof ComposioRevokedConnectionError
        ? normalized
        : new ComposioRevokedConnectionError({
            details: apiDetails ?? params.error,
            apiDetails,
            toolkit: params.toolkit,
            toolSlug: params.toolSlug,
            providerMessage: message,
          });

    return {
      normalized: mapped,
      apiDetails,
      slugValue,
      message: mapped.message,
      override: {
        kind: 'revoked_connection' as const,
        error: mapped,
      },
    };
  }

  return {
    normalized,
    apiDetails,
    slugValue,
    message,
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
