/**
 * @fileoverview The `composio.experimental` namespace. Houses experimental
 * SDK methods whose shape may change in future releases.
 *
 * Domain-specific mounts remain preferred when they exist (for example
 * `composio.connectedAccounts.updateAcl(...)`). This namespace keeps
 * compatibility aliases while those APIs are experimental. For experimental
 * stateless factories (e.g. `experimental_createTool`), see the top-level
 * `experimental_*` exports from `@composio/core`.
 */
import ComposioClient, { BadRequestError } from '@composio/client';
import {
  ConnectedAccountPatchParams,
  ConnectedAccountPatchResponse,
} from '@composio/client/resources/connected-accounts';
import {
  ConnectedAccountExperimental,
  UpdateConnectedAccountAclParams,
  UpdateConnectedAccountAclParamsSchema,
} from '../types/connectedAccounts.types';
import { ValidationError } from '../errors/ValidationErrors';
import { ComposioAclOnlyForSharedError } from '../errors';
import { telemetry } from '../telemetry/Telemetry';

/**
 * Server-side 400 message the API uses to reject ACL writes against a
 * PRIVATE connection. Substring-matched in `updateAcl` and in the sibling
 * `connectedAccounts.link()` / `session.authorize()` call sites — kept as
 * a single constant so a server-side message tweak only requires one edit.
 */
export const ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT = 'acl_config_for_shared is only valid on SHARED';

/**
 * Structural shape of the wire's experimental block on requests. Both
 * the `link.create` and `tool_router.session.link` wire types are
 * Stainless-generated as nominally distinct namespaces but accept this
 * shape — sharing one structural type keeps the SDK helpers reusable.
 */
type ExperimentalWire = {
  account_type?: 'PRIVATE' | 'SHARED';
  acl_config_for_shared?: {
    allow_all_users?: boolean;
    allowed_user_ids?: string[];
    not_allowed_user_ids?: string[];
  };
};

/**
 * Serialise the SDK's `aclConfigForShared` (camelCase) to the wire's
 * `acl_config_for_shared` block. Returns `undefined` when the caller
 * didn't pass anything (PATCH-style "don't touch ACL"); returns `{}`
 * when the caller passed an explicit empty object.
 */
export function serializeAclConfigForWire(
  acl:
    | {
        allowAllUsers?: boolean;
        allowedUserIds?: string[];
        notAllowedUserIds?: string[];
      }
    | undefined
): NonNullable<ExperimentalWire['acl_config_for_shared']> | undefined {
  if (acl === undefined) return undefined;
  return {
    ...(acl.allowAllUsers !== undefined && { allow_all_users: acl.allowAllUsers }),
    ...(acl.allowedUserIds !== undefined && { allowed_user_ids: acl.allowedUserIds }),
    ...(acl.notAllowedUserIds !== undefined && { not_allowed_user_ids: acl.notAllowedUserIds }),
  };
}

/**
 * Serialise the SDK's `experimental` options block (camelCase) to the
 * wire's `experimental` block (snake_case). Used by both
 * `connectedAccounts.link()` and `session.authorize()`. Returns
 * `undefined` when the caller didn't pass the block at all.
 */
export function serializeExperimentalForWire(
  experimental: ConnectedAccountExperimental | undefined
): ExperimentalWire | undefined {
  if (experimental === undefined) return undefined;
  const aclWire = serializeAclConfigForWire(experimental.aclConfigForShared);
  const wire: ExperimentalWire = {};
  if (experimental.accountType !== undefined) {
    wire.account_type = experimental.accountType;
  }
  if (aclWire !== undefined) {
    wire.acl_config_for_shared = aclWire;
  }
  return wire;
}

/**
 * `composio.experimental` namespace. Keeps compatibility aliases for
 * experimental surfaces while domain-specific mounts graduate. **Shape may
 * change in future releases.**
 */
export async function updateConnectedAccountAcl(
  client: ComposioClient,
  nanoid: string,
  params: UpdateConnectedAccountAclParams
): Promise<ConnectedAccountPatchResponse> {
  const parsedParams = UpdateConnectedAccountAclParamsSchema.safeParse(params);
  if (!parsedParams.success) {
    throw new ValidationError('Failed to parse connected account ACL update params', {
      cause: parsedParams.error,
    });
  }

  const body: ConnectedAccountPatchParams = {
    experimental: {
      acl_config_for_shared: serializeAclConfigForWire(parsedParams.data),
    },
  };

  try {
    return await client.connectedAccounts.patch(nanoid, body);
  } catch (error) {
    if (
      error instanceof BadRequestError &&
      typeof error.message === 'string' &&
      error.message.includes(ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT)
    ) {
      throw new ComposioAclOnlyForSharedError(error.message, { cause: error });
    }
    throw error;
  }
}

export class Experimental {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'Experimental');
  }

  /**
   * Compatibility alias for `composio.connectedAccounts.updateAcl(...)`.
   * Update the per-user ACL on a SHARED connected account.
   * **Experimental — shape may change in future releases.**
   *
   * Only meaningful for SHARED connections — calling this on a PRIVATE
   * connection raises `ComposioAclOnlyForSharedError` (400). ACL writes
   * require the connection's creator or an API key.
   *
   * PATCH semantics: omit a field to leave it unchanged; pass an empty
   * array to clear an allow/deny list. At least one field must be
   * provided.
   *
   * Resolution rule (deny wins):
   *   1. requesting `userId` in `notAllowedUserIds` → DENY
   *   2. `allowAllUsers === true`                   → ALLOW
   *   3. requesting `userId` in `allowedUserIds`    → ALLOW
   *   4. otherwise                                  → DENY
   *
   * @example
   * ```typescript
   * import { Composio } from '@composio/core';
   *
   * const composio = new Composio({ apiKey: '...' });
   *
   * // Allow every userId to use this connection
   * await composio.connectedAccounts.updateAcl('ca_abc', { allowAllUsers: true });
   *
   * // Everyone except a specific user
   * await composio.connectedAccounts.updateAcl('ca_abc', {
   *   allowAllUsers: true,
   *   notAllowedUserIds: ['user_bob'],
   * });
   *
   * // Targeted allow
   * await composio.connectedAccounts.updateAcl('ca_abc', {
   *   allowedUserIds: ['user_alice', 'user_bob'],
   * });
   *
   * // Revoke a previously-granted allow list (back to deny-by-default)
   * await composio.connectedAccounts.updateAcl('ca_abc', { allowedUserIds: [] });
   * ```
   *
   * **Empty-array semantics — read carefully.** Passing `[]` for either
   * list **replaces** the list, it does not extend it:
   *
   * - `allowedUserIds: []` → revoke all previously-granted user IDs (state
   *   reverts to deny-by-default unless `allowAllUsers` is true).
   * - `notAllowedUserIds: []` → **clears the deny list**, which silently
   *   re-grants access to users you previously blocked. Always pair an
   *   empty deny list with a deliberate audit of the allow side.
   *
   * @returns The PATCH response (`{ id, status, success }`). To read
   *   the updated ACL block, call
   *   `composio.connectedAccounts.get(nanoid)` after the promise
   *   resolves and inspect `account.experimental?.aclConfigForShared`.
   *
   * @deprecated Use `composio.connectedAccounts.updateAcl(...)` instead — ACL updates graduated onto the `connectedAccounts` mount. This experimental alias is kept only for backwards compatibility and will be removed once the API graduates. Prefer the `connectedAccounts` mount; do not generate new code against this alias.
   */
  async updateAcl(
    nanoid: string,
    params: UpdateConnectedAccountAclParams
  ): Promise<ConnectedAccountPatchResponse> {
    return updateConnectedAccountAcl(this.client, nanoid, params);
  }
}
