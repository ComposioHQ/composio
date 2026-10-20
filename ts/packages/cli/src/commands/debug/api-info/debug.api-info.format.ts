// --- stderr -----------------------------------------------------------------------------------

export const CONFIRM_PRINT_CREDENTIALS_MESSAGE =
  'This will print your current CLI API key and scoped identifiers to stdout. Continue?';

// --- usage messages ---------------------------------------------------------------------------

export const ABORTED_MESSAGE = 'Aborted printing API credentials.';
export const NO_API_KEY_MESSAGE = 'No user API key found in the current CLI session.';

// --- stdout -----------------------------------------------------------------------------------

/** The credentials and identifiers `debug api-info` prints. */
export type DebugApiInfo = {
  readonly apiKey: string;
  readonly orgId: string | null;
  readonly consumerUserId: string | null;
};

export const formatDebugApiInfo = (info: DebugApiInfo) =>
  JSON.stringify(
    { apiKey: info.apiKey, orgId: info.orgId, consumerUserId: info.consumerUserId },
    null,
    2
  );
