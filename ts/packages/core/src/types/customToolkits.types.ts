import { z } from 'zod/v3';

const CustomToolkitApiKeyFieldSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
});
export type CustomToolkitApiKeyField = z.infer<typeof CustomToolkitApiKeyFieldSchema>;

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
    apiKeyField: CustomToolkitApiKeyFieldSchema.optional(),
    /** Additional connect-page input used by `{{generic_id}}` in headers. */
    additionalFields: z
      .object({
        genericId: z.object({
          displayName: z.string().min(1).max(100),
          description: z.string().min(1).max(500).optional(),
        }),
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

const CustomToolkitLogoFileSchema = z.object({
  content: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg']),
});
export type CustomToolkitLogoFile = z.infer<typeof CustomToolkitLogoFileSchema>;

/**
 * Params for `composio.experimental.customToolkits.create()`.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 */
export const CustomToolkitCreateParamsSchema = z.object({
  /** Human-readable toolkit name. */
  name: z.string().min(1).max(200),
  /** The MCP server URL. Must use https. */
  mcpUrl: z.string().url(),
  /** Square PNG or JPEG logo (256-1024px, max 3MB), base64-encoded. Defaults to the MCP logo. */
  logoFile: CustomToolkitLogoFileSchema.optional(),
  /** At least one scheme. Cannot be changed after create. */
  authSchemes: z.array(CustomToolkitAuthSchemeSchema).min(1),
  /**
   * `'all'` to share the toolkit with every user in the project, or a user ID
   * to make it private to that user. Cannot be changed after create.
   */
  userId: z.string().min(1),
  /** Where to send the user after they connect. Used only for `connectLink`. */
  callbackUrl: z.string().url().optional(),
});
export type CustomToolkitCreateParams = z.infer<typeof CustomToolkitCreateParamsSchema>;

export const CustomToolkitCreateResponseSchema = z.object({
  /** Slug of the created toolkit. Store it to update, sync or delete the toolkit later. */
  slug: z.string(),
  /**
   * Hosted connect page for a private toolkit's user. `null` for shared or
   * no-auth toolkits, or if the link could not be created.
   */
  connectLink: z
    .object({
      redirectUrl: z.string(),
      expiresAt: z.string(),
      connectedAccountId: z.string(),
    })
    .nullable(),
});
export type CustomToolkitCreateResponse = z.infer<typeof CustomToolkitCreateResponseSchema>;

/**
 * Params for `composio.experimental.customToolkits.update()`.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 */
export const CustomToolkitUpdateParamsSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    logoFile: CustomToolkitLogoFileSchema.optional(),
    /** End-user copy for the API key input on the connect page. API_KEY toolkits only. */
    apiKeyField: CustomToolkitApiKeyFieldSchema.optional(),
    /**
     * The user the toolkit is private to. Required to update a private toolkit
     * when the project has 2FA enabled.
     */
    userId: z.string().min(1).optional(),
  })
  .refine(
    params => [params.name, params.logoFile, params.apiKeyField].some(value => value !== undefined),
    { message: 'Provide at least one of name, logoFile, apiKeyField' }
  );
export type CustomToolkitUpdateParams = z.infer<typeof CustomToolkitUpdateParamsSchema>;

export const CustomToolkitUpdateResponseSchema = z.object({
  success: z.literal(true),
});
export type CustomToolkitUpdateResponse = z.infer<typeof CustomToolkitUpdateResponseSchema>;

/**
 * Params for `composio.experimental.customToolkits.upsert()`.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 *
 * @deprecated Use `CustomToolkitCreateParams` with `create()`.
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
    /** The MCP server URL. Must use https. */
    mcpUrl: z.string().url(),
    /** Square PNG or JPEG logo (256-1024px, max 3MB), base64-encoded. Defaults to the Composio logo. */
    logoFile: CustomToolkitLogoFileSchema.optional(),
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
