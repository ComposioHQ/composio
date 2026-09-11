import { z } from 'zod/v3';
import { AuthSchemeEnum } from './authConfigs.types';

/**
 * Toolkit list params
 */
export const ToolkitMangedByEnumSchema = z.enum(['all', 'composio', 'project']);
export const ToolkitSortByEnumSchema = z.enum(['usage', 'alphabetically']);
export const ToolkitsListParamsSchema = z.object({
  category: z.string().optional(),
  managedBy: ToolkitMangedByEnumSchema.optional(),
  sortBy: ToolkitSortByEnumSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().optional(),
});

export type ToolkitMangedByEnum = z.infer<typeof ToolkitMangedByEnumSchema>;
export type ToolkitSortByEnum = z.infer<typeof ToolkitSortByEnumSchema>;
export type ToolkitListParams = z.infer<typeof ToolkitsListParamsSchema>;

/**
 * Toolkit getMany params — the slugs to fetch plus the same filters `list`
 * accepts.
 */
export const ToolkitGetManySlugsSchema = z.array(z.string().min(1)).min(1);
export const ToolkitsGetManyParamsSchema = ToolkitsListParamsSchema;
export type ToolkitGetManyParams = z.infer<typeof ToolkitsGetManyParamsSchema>;

/**
 * Toolkits response
 */
export const ToolKitMetaSchema = z.object({
  categories: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  appUrl: z.string().optional(),
  createdAt: z.string().optional(),
  description: z.string().optional(),
  logo: z.string().optional(),
  toolsCount: z.number().optional(),
  triggersCount: z.number().optional(),
  updatedAt: z.string().optional(),
  availableVersions: z.array(z.string()).optional(),
});

export const ToolKitItemSchema = z.object({
  name: z.string(),
  slug: z.string(),
  meta: ToolKitMetaSchema,
  isLocalToolkit: z.boolean(),
  authSchemes: z.array(z.string()).optional(),
  composioManagedAuthSchemes: z.array(z.string()).optional(),
  noAuth: z.boolean().optional(),
});

export const ToolKitListResponseSchema = z.array(ToolKitItemSchema);

export type ToolKitMeta = z.infer<typeof ToolKitMetaSchema>;
export type ToolKitItem = z.infer<typeof ToolKitItemSchema>;
export type ToolKitListResponse = z.infer<typeof ToolKitListResponseSchema>;

/**
 * Toolkit retrieve response
 */
export const ToolkitAuthFieldSchema = z.object({
  description: z.string(),
  displayName: z.string(),
  required: z.boolean(),
  name: z.string(),
  type: z.string(),
  default: z.string().nullable().optional(),
});
export const ToolkitAuthConfigDetailsSchema = z.object({
  name: z.string(),
  mode: z.string(),
  fields: z.object({
    authConfigCreation: z.object({
      optional: z.array(ToolkitAuthFieldSchema),
      required: z.array(ToolkitAuthFieldSchema),
    }),
    connectedAccountInitiation: z.object({
      optional: z.array(ToolkitAuthFieldSchema),
      required: z.array(ToolkitAuthFieldSchema),
    }),
  }),
  proxy: z
    .object({
      baseUrl: z.string().optional(),
    })
    .optional(),
});

export const ToolkitRetrieveResponseSchema = z.object({
  name: z.string(),
  slug: z.string(),
  meta: ToolKitMetaSchema,
  isLocalToolkit: z.boolean(),
  composioManagedAuthSchemes: z.array(z.string()).optional(),
  authConfigDetails: z.array(ToolkitAuthConfigDetailsSchema).optional(),
  baseUrl: z.string().optional(),
  getCurrentUserEndpoint: z.string().optional(),
  getCurrentUserEndpointMethod: z.string().optional(),
});

export type ToolkitAuthField = z.infer<typeof ToolkitAuthFieldSchema>;
export type ToolkitAuthConfigDetails = z.infer<typeof ToolkitAuthConfigDetailsSchema>;
export type ToolkitRetrieveResponse = z.infer<typeof ToolkitRetrieveResponseSchema>;

/**
 * Toolkit categories response
 */
export const ToolkitCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
});
export const ToolkitRetrieveCategoriesResponseSchema = z.object({
  items: z.array(ToolkitCategorySchema),
  nextCursor: z.string().nullable(),
  totalPages: z.number(),
});

export type ToolkitCategory = z.infer<typeof ToolkitCategorySchema>;
export type ToolkitRetrieveCategoriesResponse = z.infer<
  typeof ToolkitRetrieveCategoriesResponseSchema
>;

/**
 * Toolkit changelog response
 */
export const ToolkitVersionChangelogSchema = z.object({
  version: z.string(),
  changelog: z.string(),
});
export const ToolkitChangelogItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  displayName: z.string(),
  /** Most recent versions first; the API returns up to the last 10 per toolkit. */
  versions: z.array(ToolkitVersionChangelogSchema),
});
export const ToolkitChangelogResponseSchema = z.object({
  items: z.array(ToolkitChangelogItemSchema),
});

export type ToolkitVersionChangelog = z.infer<typeof ToolkitVersionChangelogSchema>;
export type ToolkitChangelogItem = z.infer<typeof ToolkitChangelogItemSchema>;
export type ToolkitChangelogResponse = z.infer<typeof ToolkitChangelogResponseSchema>;

/**
 * Params for `composio.toolkits.recommendScopes()`.
 * **Experimental — shape may change in future releases.**
 */
export const ToolkitRecommendScopesParamsSchema = z.object({
  /** Tool slugs to cover. Pass `[]` to cover every tool in the toolkit. */
  tools: z.array(z.string()),
  /** Auth scheme the connection will use. The API defaults to `OAUTH2`. */
  authScheme: AuthSchemeEnum.optional(),
  /** Toolkit version to compute from. The API defaults to the latest published version. */
  toolkitVersion: z.string().min(1).optional(),
  /**
   * Context the scopes will be granted in, as dimension → selected value,
   * for example `{ account_type: 'Google Workspace' }`. Discover the
   * dimensions with `composio.toolkits.listGrantContexts()`.
   */
  grantContext: z.record(z.string(), z.string()).optional(),
  /** Scopes the recommendation must include, whether or not the tools need them. */
  include: z.array(z.string()).optional(),
  /** Scopes the recommendation must not include; the API picks documented alternatives or fails. */
  exclude: z.array(z.string()).optional(),
  /** Scopes your OAuth app can request. The recommendation never goes outside this list. */
  availableScopes: z.array(z.string()).optional(),
});
export type ToolkitRecommendScopesParams = z.infer<typeof ToolkitRecommendScopesParamsSchema>;

export const ToolkitConditionalScopeSchema = z.object({
  /** The scope needed only when the `when` guard matches. */
  scope: z.string(),
  /** Input field name → qualifying values. Any value matches within a field; all fields must match. */
  when: z.record(z.string(), z.array(z.string())),
  /** Tool slugs that need this scope under the guard. */
  for: z.array(z.string()),
});
export type ToolkitConditionalScope = z.infer<typeof ToolkitConditionalScopeSchema>;

/**
 * Response of `composio.toolkits.recommendScopes()`.
 * **Experimental — shape may change in future releases.**
 */
export const ToolkitRecommendScopesResponseSchema = z.object({
  /** Auth scheme the recommendation was computed under. */
  authScheme: z.string(),
  /** Concrete toolkit version the answer was computed from; pass it back as `toolkitVersion` to pin. */
  toolkitVersion: z.string(),
  /** The effective grant context: the toolkit default overlaid with your overrides. */
  grantContext: z.record(z.string(), z.string()),
  scopes: z.object({
    /** Narrowest documented option per requirement. */
    leastPrivilege: z.array(z.string()),
    /** Smallest scope set covering all requirements. */
    fewest: z.array(z.string()),
    /**
     * Scopes needed only for particular call-time inputs. Both lists above
     * already include them, so a caller that knows its inputs may drop the rest.
     */
    conditional: z.array(ToolkitConditionalScopeSchema),
  }),
});
export type ToolkitRecommendScopesResponse = z.infer<typeof ToolkitRecommendScopesResponseSchema>;

/**
 * Params for `composio.toolkits.listGrantContexts()`.
 * **Experimental — shape may change in future releases.**
 */
export const ToolkitListGrantContextsParamsSchema = z.object({
  /** Auth scheme the connection will use. The API defaults to `OAUTH2`. */
  authScheme: AuthSchemeEnum.optional(),
  /** Toolkit version to read the scope catalog from. The API defaults to the latest published version. */
  toolkitVersion: z.string().min(1).optional(),
});
export type ToolkitListGrantContextsParams = z.infer<typeof ToolkitListGrantContextsParamsSchema>;

export const ToolkitGrantContextDimensionSchema = z.object({
  /** Dimension name to use as a `grantContext` key. */
  dimension: z.string(),
  /** What the dimension means and when to pass it. */
  description: z.string(),
  /** Values the dimension can take. */
  values: z.array(z.string()),
});
export type ToolkitGrantContextDimension = z.infer<typeof ToolkitGrantContextDimensionSchema>;

/**
 * Response of `composio.toolkits.listGrantContexts()`.
 * **Experimental — shape may change in future releases.**
 */
export const ToolkitListGrantContextsResponseSchema = z.object({
  /** Auth scheme whose scope catalog the dimensions were read from. */
  authScheme: z.string(),
  /** Concrete toolkit version the answer was computed from. */
  toolkitVersion: z.string(),
  /** Dimensions the toolkit accepts in `grantContext`; empty when no scope depends on one. */
  grantContextDimensions: z.array(ToolkitGrantContextDimensionSchema),
  /** The grant context assumed when you pass none. */
  defaultGrantContext: z.record(z.string(), z.string()),
});
export type ToolkitListGrantContextsResponse = z.infer<
  typeof ToolkitListGrantContextsResponseSchema
>;

export const ToolkitAuthFieldsResponseSchema = z.array(
  ToolkitAuthFieldSchema.extend({
    required: z.boolean().optional(),
  })
);

export type ToolkitAuthFieldsResponse = z.infer<typeof ToolkitAuthFieldsResponseSchema>;
