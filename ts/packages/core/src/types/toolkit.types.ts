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

export const ToolkitAuthFieldsResponseSchema = z.array(
  ToolkitAuthFieldSchema.extend({
    required: z.boolean().optional(),
  })
);

export type ToolkitAuthFieldsResponse = z.infer<typeof ToolkitAuthFieldsResponseSchema>;
