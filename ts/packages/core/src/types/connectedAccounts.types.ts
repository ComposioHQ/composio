import { z } from 'zod/v3';
import { ConnectionDataSchema } from './connectedAccountAuthStates.types';
import { AuthSchemeEnum } from './authConfigs.types';

/**
 * Connected Account create parameters
 */
export const ConnectedAccountStatuses = {
  INITIALIZING: 'INITIALIZING',
  INITIATED: 'INITIATED',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  INACTIVE: 'INACTIVE',
  REVOKED: 'REVOKED',
} as const;
export const ConnectedAccountStatusSchema = z.enum([
  ConnectedAccountStatuses.INITIALIZING,
  ConnectedAccountStatuses.INITIATED,
  ConnectedAccountStatuses.ACTIVE,
  ConnectedAccountStatuses.FAILED,
  ConnectedAccountStatuses.EXPIRED,
  ConnectedAccountStatuses.INACTIVE,
  ConnectedAccountStatuses.REVOKED,
]);
export type ConnectedAccountStatus =
  (typeof ConnectedAccountStatuses)[keyof typeof ConnectedAccountStatuses];
export type ConnectedAccountStatusEnum = z.infer<typeof ConnectedAccountStatusSchema>;

/**
 * Sharing model for a connected account.
 *
 * - `PRIVATE` (default): only the owning `userId` can use the connection.
 * - `SHARED`: can be used by other `userId`s, but only when the connection
 *   is explicitly pinned in a tool-router session's config and only when
 *   the requesting `userId` passes the connection's ACL (see
 *   `allowAllUsers` / `allowedUserIds` / `notAllowedUserIds`).
 */
export const ConnectedAccountTypes = {
  PRIVATE: 'PRIVATE',
  SHARED: 'SHARED',
} as const;
export const ConnectedAccountTypeSchema = z.enum([
  ConnectedAccountTypes.PRIVATE,
  ConnectedAccountTypes.SHARED,
]);
export type ConnectedAccountType =
  (typeof ConnectedAccountTypes)[keyof typeof ConnectedAccountTypes];

/**
 * Per-user access control for a SHARED connected account. Ignored for
 * PRIVATE.
 *
 * Pass `aclConfigForShared` on create / PATCH to grant access; omit it
 * to leave the ACL unchanged (on PATCH) or to keep the default
 * deny-by-default state (on create). On responses, the field is
 * `undefined` when the caller isn't authorised to see the ACL —
 * distinguish that from an empty/default state explicitly.
 *
 * Resolution rule (deny wins):
 *   1. requesting `userId` in `notAllowedUserIds` → DENY
 *   2. `allowAllUsers === true`                   → ALLOW
 *   3. requesting `userId` in `allowedUserIds`    → ALLOW
 *   4. otherwise                                  → DENY  (deny-by-default)
 *
 * Default state (block omitted or `{}`) means only the connection's
 * creator can use it. The creator must grant access explicitly.
 *
 * Limits: each list accepts up to 1000 entries; each `userId` is
 * 1..256 characters.
 */
const ACL_LIST_MAX_LENGTH = 1000;
const ACL_USER_ID_MAX_LENGTH = 256;
const aclUserIdString = z.string().min(1).max(ACL_USER_ID_MAX_LENGTH);

export const ConnectedAccountAclConfigSchema = z.object({
  allowAllUsers: z
    .boolean()
    .optional()
    .describe('When true, any `userId` may use this SHARED connection (subject to the deny list). Default false.'),
  allowedUserIds: z
    .array(aclUserIdString)
    .max(ACL_LIST_MAX_LENGTH)
    .optional()
    .describe('Explicit list of `userId` strings allowed to use this SHARED connection. Default [].'),
  notAllowedUserIds: z
    .array(aclUserIdString)
    .max(ACL_LIST_MAX_LENGTH)
    .optional()
    .describe('Explicit list of `userId` strings denied access. Wins over allow on conflict. Default [].'),
});
export type ConnectedAccountAclConfig = z.infer<typeof ConnectedAccountAclConfigSchema>;

/**
 * Resolved ACL as it appears on responses. All three fields are populated
 * when the field is visible; the field itself is `undefined` for callers
 * not authorised to see it.
 */
export const ConnectedAccountAclConfigResponseSchema = z.object({
  allowAllUsers: z.boolean(),
  allowedUserIds: z.array(z.string()),
  notAllowedUserIds: z.array(z.string()),
});
export type ConnectedAccountAclConfigResponse = z.infer<
  typeof ConnectedAccountAclConfigResponseSchema
>;

export const CreateConnectedAccountParamsSchema = z.object({
  authConfig: z.object({
    id: z.string(),
  }),
  connection: z.object({
    data: z.record(z.string(), z.unknown()).optional(),
    callbackUrl: z.string().optional(),
    userId: z.string().optional(),
  }),
});
export const DefaultCreateConnectedAccountParamsSchema: z.ZodType<{
  auth_config: { id: string };
  connection: {
    state?: z.infer<typeof ConnectionDataSchema>;
    data?: Record<string, unknown>;
    callback_url?: string;
    user_id?: string;
    alias?: string;
  };
}> = z.object({
  auth_config: z.object({
    id: z.string(),
  }),
  connection: z.object({
    state: ConnectionDataSchema.optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    callback_url: z.string().optional(),
    user_id: z.string().optional(),
    alias: z.string().optional(),
  }),
});

export const CreateConnectedAccountOptionsSchema: z.ZodType<{
  allowMultiple?: boolean;
  callbackUrl?: string;
  config?: z.infer<typeof ConnectionDataSchema>;
  alias?: string;
}> = z.object({
  allowMultiple: z.boolean().optional(),
  callbackUrl: z.string().optional(),
  config: ConnectionDataSchema.optional(),
  alias: z.string().optional(),
});
export type CreateConnectedAccountOptions = z.infer<typeof CreateConnectedAccountOptionsSchema>;
export type CreateConnectedAccountParams = z.infer<typeof CreateConnectedAccountParamsSchema>;
/**
 * Connected Account create response
 */
export const CreateConnectedAccountResponseSchema = z.object({
  id: z.string(),
  status: ConnectedAccountStatusSchema,
  redirectUrl: z.string().nullable(),
});
export type CreateConnectedAccountResponse = z.infer<typeof CreateConnectedAccountResponseSchema>;

export const ConnectedAccountAuthConfigSchema = z.object({
  id: z.string(),
  /** @deprecated use connectedAccount.state.authScheme instead */
  authScheme: AuthSchemeEnum.optional(),
  isComposioManaged: z.boolean(),
  isDisabled: z.boolean(),
});
export type ConnectedAccountAuthConfig = z.infer<typeof ConnectedAccountAuthConfigSchema>;

export const ConnectedAccountRetrieveResponseSchema: z.ZodType<{
  id: string;
  authConfig: z.infer<typeof ConnectedAccountAuthConfigSchema>;
  wordId?: string | null;
  alias?: string | null;
  /** @deprecated use connectedAccount.state instead */
  data?: Record<string, unknown>;
  /** @deprecated use connectedAccount.state instead */
  params?: Record<string, unknown>;
  status: ConnectedAccountStatusEnum;
  statusReason: string | null;
  toolkit: { slug: string };
  state?: z.infer<typeof ConnectionDataSchema>;
  testRequestEndpoint?: string;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  accountType?: ConnectedAccountType;
  aclConfigForShared?: ConnectedAccountAclConfigResponse;
}> = z.object({
  id: z.string(),
  authConfig: ConnectedAccountAuthConfigSchema,
  wordId: z.string().nullable().optional(),
  alias: z.string().nullable().optional(),
  /**
   * @deprecated use connectedAccount.state instead
   */
  data: z.record(z.string(), z.unknown()).optional(),
  /**
   * @deprecated use connectedAccount.state instead
   */
  params: z.record(z.string(), z.unknown()).optional(),
  status: ConnectedAccountStatusSchema,
  statusReason: z.string().nullable(),
  toolkit: z.object({
    slug: z.string(),
  }),
  state: ConnectionDataSchema.optional(),
  testRequestEndpoint: z.string().optional(),
  isDisabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  accountType: ConnectedAccountTypeSchema.optional(),
  // `aclConfigForShared` is only present on the response when the caller
  // is authorised to see the ACL — otherwise the block is absent and the
  // field is `undefined`. Callers can distinguish "I can't see the ACL"
  // from "ACL is the default deny-by-default state" by checking for the
  // presence of the field.
  aclConfigForShared: ConnectedAccountAclConfigResponseSchema.optional(),
});

export type ConnectedAccountRetrieveResponse = z.infer<
  typeof ConnectedAccountRetrieveResponseSchema
>;

/**
 * Type for list response item that doesn't include params
 */
export type ConnectedAccountListResponseItem = Omit<ConnectedAccountRetrieveResponse, 'params'>;

export const ConnectedAccountListParamsSchema = z.object({
  authConfigIds: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('The auth config ids of the connected accounts'),
  cursor: z.string().nullish().describe('The cursor to paginate through the connected accounts'),
  limit: z.number().nullable().optional().describe('The limit of the connected accounts to return'),
  orderBy: z
    .enum(['created_at', 'updated_at'])
    .optional()
    .describe('The order by of the connected accounts'),
  statuses: z
    .array(ConnectedAccountStatusSchema)
    .nullable()
    .optional()
    .describe('The statuses of the connected accounts'),
  toolkitSlugs: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('The toolkit slugs of the connected accounts'),
  userIds: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('The user ids of the connected accounts'),
});
export type ConnectedAccountListParams = z.infer<typeof ConnectedAccountListParamsSchema>;

export const ConnectedAccountListResponseSchema = z.object({
  items: z.array(ConnectedAccountRetrieveResponseSchema).describe('The list of connected accounts'),
  nextCursor: z
    .string()
    .nullish()
    .describe('The next cursor to paginate through the connected accounts'),
  totalPages: z.number().describe('The total number of pages of connected accounts'),
});
export type ConnectedAccountListResponse = z.infer<typeof ConnectedAccountListResponseSchema>;

export const CreateConnectedAccountLinkOptionsSchema = z.object({
  /**
   * The url to redirect the user to post connecting their account.
   *
   * For sucessfull connections, you will get a query param called status=success
   * And for failed connections you will get a query param called satus=failed
   *
   * @example https://your-app.com/callback
   *
   */
  callbackUrl: z.string().optional(),
  /**
   * Human-readable alias for the connected account. Must be unique per userId and toolkit within the project.
   */
  alias: z.string().optional(),
  /**
   * Whether to allow multiple connected accounts for the same user and auth config.
   * When `false` (default), `link()` throws `ComposioMultipleConnectedAccountsError`
   * if the user already has an `ACTIVE` connection on this auth config — matching
   * the guard on `initiate()`. Pair with `alias` and a session-level
   * `multiAccount` config to disambiguate at execution time.
   */
  allowMultiple: z.boolean().optional(),
  /**
   * Sharing model for the new connection. `PRIVATE` (default) is usable only
   * by the owning `userId`. `SHARED` can be used by other `userId`s — but
   * only when the connection is explicitly pinned in a tool-router session's
   * config and only when the requesting `userId` passes the connection's
   * ACL.
   */
  accountType: ConnectedAccountTypeSchema.optional(),
  /**
   * Per-user ACL for SHARED connections. Only valid when
   * `accountType === 'SHARED'`; raises `ComposioAclOnlyForSharedError`
   * on a PRIVATE connection.
   *
   * Omit the block (or pass `{}`) to keep the deny-by-default state: only the
   * creator can use the connection. Grant access by setting
   * `allowAllUsers: true` or listing user IDs in `allowedUserIds`.
   * `notAllowedUserIds` always wins over allow.
   */
  aclConfigForShared: ConnectedAccountAclConfigSchema.optional(),
});
export type CreateConnectedAccountLinkOptions = z.infer<
  typeof CreateConnectedAccountLinkOptionsSchema
>;

export const CreateConnectedAccountLinkResponseSchema = z.object({
  redirectUrl: z.string(),
});
export type CreateConnectedAccountLinkResponse = z.infer<
  typeof CreateConnectedAccountLinkResponseSchema
>;

export const ConnectedAccountRefreshOptionsSchema = z.object({
  redirectUrl: z.string().optional(),
  validateCredentials: z.boolean().optional(),
});
export type ConnectedAccountRefreshOptions = z.infer<typeof ConnectedAccountRefreshOptionsSchema>;

// Use the Stainless-generated type as the source of truth for update params.
export type { ConnectedAccountUpdateStatusParams as UpdateConnectedAccountParams } from '@composio/client/resources/connected-accounts';

export const UpdateConnectedAccountParamsSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Params for `composio.connectedAccounts.updateAcl()`. Mirrors the inner
 * shape of the wire's `acl_config_for_shared` block — the SDK adds the
 * outer nesting at the boundary, so callers pass the three fields flat.
 *
 * PATCH-style semantics — omit a field to leave it unchanged; pass an
 * empty array to clear an allow/deny list. Raises
 * `ComposioAclOnlyForSharedError` on a PRIVATE connection.
 *
 * Each field is optional, but at least one must be provided — passing an
 * empty object is rejected as a no-op.
 */
// NOTE: `UpdateConnectedAccountAclParamsSchema` is a ZodEffects (because of
// the `.refine` below) — it does not expose `.shape`. If you need to reuse
// individual ACL fields elsewhere, pull them from
// `ConnectedAccountAclConfigSchema.shape` (the unrefined base) instead.
export const UpdateConnectedAccountAclParamsSchema = ConnectedAccountAclConfigSchema.refine(
  acl =>
    acl.allowAllUsers !== undefined ||
    acl.allowedUserIds !== undefined ||
    acl.notAllowedUserIds !== undefined,
  {
    message:
      'At least one of allowAllUsers, allowedUserIds, or notAllowedUserIds must be provided',
  }
);
export type UpdateConnectedAccountAclParams = z.infer<typeof UpdateConnectedAccountAclParamsSchema>;
