import { z } from 'zod/v3';

/**
 * How end users authenticate to a custom toolkit.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 */
export const CustomToolkitAuthSchemeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('NO_AUTH') }),
  z.object({
    mode: z.literal('API_KEY'),
    /**
     * Headers sent with each request. Write `{{generic_api_key}}` where the
     * end user's API key goes, for example
     * `{ Authorization: 'Bearer {{generic_api_key}}' }`.
     */
    headers: z.record(z.string(), z.string()),
    /** End-user copy for the API key input on the connect page. */
    apiKeyField: z
      .object({
        displayName: z.string().min(1).max(100).optional(),
        description: z.string().min(1).max(500).optional(),
      })
      .optional(),
  }),
  z.object({
    mode: z.literal('DCR_OAUTH'),
    /**
     * Where to fetch the full auth scheme, usually the
     * `/.well-known/oauth-authorization-server` path of your MCP URL.
     */
    discoveryUrl: z.string().url(),
  }),
]);
export type CustomToolkitAuthScheme = z.infer<typeof CustomToolkitAuthSchemeSchema>;

/**
 * Params for `composio.experimental.customToolkits.upsert()`.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 */
export const CustomToolkitUpsertParamsSchema = z.object({
  /**
   * Letters, digits, underscores or spaces, up to 30 characters. The API
   * prefixes it with `CUSTOM_` and turns spaces into underscores.
   */
  slug: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-zA-Z0-9_\s]+$/),
  toolkitConfig: z.object({
    /** Human-readable toolkit name. */
    name: z.string().min(1).max(200),
    /** The app URL. For an MCP app, the MCP server URL. */
    appUrl: z.string().url(),
    /** Square PNG or JPEG logo (256-1024px, max 3MB), base64-encoded. Defaults to the Composio logo. */
    logoFile: z
      .object({
        content: z.string().min(1),
        mimeType: z.enum(['image/png', 'image/jpeg']),
      })
      .optional(),
    /** At least one scheme. The schemes cannot change once the toolkit exists. */
    authSchemes: z.array(CustomToolkitAuthSchemeSchema).min(1),
  }),
});
export type CustomToolkitUpsertParams = z.infer<typeof CustomToolkitUpsertParamsSchema>;

export const CustomToolkitUpsertResponseSchema = z.object({
  /** Slug of the created or updated toolkit. */
  slug: z.string(),
});
export type CustomToolkitUpsertResponse = z.infer<typeof CustomToolkitUpsertResponseSchema>;

/**
 * Params for `composio.experimental.customToolkits.sync()`.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 */
export const CustomToolkitSyncParamsSchema = z.object({
  /** Connected account to use when fetching the remote tool definitions. */
  connectedAccountId: z.string().optional(),
});
export type CustomToolkitSyncParams = z.infer<typeof CustomToolkitSyncParamsSchema>;

export const CustomToolkitSyncResponseSchema = z.object({
  slug: z.string(),
  /** Toolkit version after the sync. */
  version: z.string(),
  /** Number of tools synced. */
  syncedCount: z.number(),
});
export type CustomToolkitSyncResponse = z.infer<typeof CustomToolkitSyncResponseSchema>;

export const CustomToolkitDeleteResponseSchema = z.object({
  /** Slug of the deleted toolkit. */
  slug: z.string(),
  deleted: z.boolean(),
  /** Background jobs revoking the credentials of the toolkit's connected accounts. */
  revokeJobIds: z.array(z.string()),
  authConfigsDeleted: z.number(),
  connectedAccountsDeleted: z.number(),
});
export type CustomToolkitDeleteResponse = z.infer<typeof CustomToolkitDeleteResponseSchema>;
