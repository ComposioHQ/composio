import { z } from 'zod';

/**
 * Toolkit list params
 */
export const ToolkitMangedByEnumSchema = z.enum(['all', 'composio_managed', 'project_managed']);
export const ToolkitSortByEnumSchema = z.enum(['usage', 'alphabetically']);
export const ToolkitsListParamsSchema = z.object({
    category: z.string().optional(),
    isLocal: z.boolean().optional(),
    managedBy: ToolkitMangedByEnumSchema.optional(),
    sortBy: ToolkitSortByEnumSchema.optional(),
});

export type ToolkitMangedByEnum = z.infer<typeof ToolkitMangedByEnumSchema>;
export type ToolkitSortByEnum = z.infer<typeof ToolkitSortByEnumSchema>;
export type ToolkitListParams = z.infer<typeof ToolkitsListParamsSchema>;


/**
 * Toolkits response
 */
export const ToolKitMetaSchema = z.object({
    categories: z.array(z.object({
        id: z.string(),
        name: z.string(),
    })),
    createdAt: z.string(),
    description: z.string(),
    logo: z.string(),
    toolsCount: z.number(),
    triggersCount: z.number(),
    updatedAt: z.string(),
});
export const ToolKitItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    meta: ToolKitMetaSchema,
    isLocalToolkit: z.boolean(),
    authSchemes: z.array(z.string()).optional(),
    composioManagedAuthSchemes: z.array(z.string()).optional(),
    noAuth: z.boolean().optional(),
});
export const ToolKitListResponseSchema = z.object({
    items: z.array(ToolKitItemSchema),
    nextCursor: z.string().nullable(),
    totalPages: z.number(),
});

export type ToolKitMeta = z.infer<typeof ToolKitMetaSchema>;
export type ToolKitItem = z.infer<typeof ToolKitItemSchema>;
export type ToolKitListResponse = z.infer<typeof ToolKitListResponseSchema>;


/**
 * Toolkit retrieve response
 */
export const ToolkitAuthFieldSchema = z.object({
    name: z.string(),
    displayName: z.string(),
    type: z.string(),
    default: z.string().nullable().optional(),
});
export const ToolkitAuthConfigDetailsSchema = z.object({
    name: z.string(),
    mode: z.string(),
    fields: z.array(z.object({
        authConfigCreation: z.object({
            optional: z.array(ToolkitAuthFieldSchema),
            required: z.array(ToolkitAuthFieldSchema),
        }),
        connectedAccountInitiation: z.object({
            optional: z.array(ToolkitAuthFieldSchema),
            required: z.array(ToolkitAuthFieldSchema),
        }),
    })),
    proxy: z.object({
        baseUrul: z.string(),
    })
});
export const ToolkitRetrieveResponseSchema = z.object({
    slug: z.string(),
    name: z.string(),
    meta: ToolKitMetaSchema,
    isLocalToolkit: z.boolean(),
    composioManagedAuthSchemes: z.array(z.string()).optional(),
    authConfigDetails: z.array(ToolkitAuthConfigDetailsSchema).optional()
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
export type ToolkitRetrieveCategoriesResponse = z.infer<typeof ToolkitRetrieveCategoriesResponseSchema>;