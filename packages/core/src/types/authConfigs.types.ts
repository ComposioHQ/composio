import { z } from 'zod';

export const AuthConfigTypes = {
  CUSTOM: 'use_custom_auth',
  COMPOSIO_MANAGED: 'use_composio_managed_auth',
} as const;
export type AuthConfigType = (typeof AuthConfigTypes)[keyof typeof AuthConfigTypes];

export const AuthSchemeTypes = {
  OAUTH2: 'OAUTH2',
  OAUTH1: 'OAUTH1',
  OAUTH1A: 'OAUTH1A',
  API_KEY: 'API_KEY',
  BASIC: 'BASIC',
  BILLCOM_AUTH: 'BILLCOM_AUTH',
  BEARER_TOKEN: 'BEARER_TOKEN',
  GOOGLE_SERVICE_ACCOUNT: 'GOOGLE_SERVICE_ACCOUNT',
  NO_AUTH: 'NO_AUTH',
  BASIC_WITH_JWT: 'BASIC_WITH_JWT',
  COMPOSIO_LINK: 'COMPOSIO_LINK',
  CALCOM_AUTH: 'CALCOM_AUTH',
  SNOWFLAKE: 'SNOWFLAKE',
} as const;
export type AuthSchemeType = (typeof AuthSchemeTypes)[keyof typeof AuthSchemeTypes];

export const AuthSchemeEnum = z.enum([
  'OAUTH2',
  'OAUTH1',
  'OAUTH1A',
  'API_KEY',
  'BASIC',
  'BILLCOM_AUTH',
  'BEARER_TOKEN',
  'GOOGLE_SERVICE_ACCOUNT',
  'NO_AUTH',
  'BASIC_WITH_JWT',
  'COMPOSIO_LINK',
  'CALCOM_AUTH',
  'SNOWFLAKE',
]);
export const CreateCustomAuthConfigParamsSchema = z.object({
  type: z.literal('use_custom_auth'),
  name: z.string().optional(),
  credentials: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  authScheme: AuthSchemeEnum,
});

export const CreateComposioManagedAuthConfigParamsSchema = z.object({
  type: z.literal('use_composio_managed_auth'),
  name: z.string().optional(),
  credentials: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/**
 * Discriminated union of all possible auth config types.
 */
export const CreateAuthConfigParamsSchema = z.discriminatedUnion('type', [
  CreateCustomAuthConfigParamsSchema,
  CreateComposioManagedAuthConfigParamsSchema,
]);

export type CreateAuthConfigParams = z.infer<typeof CreateAuthConfigParamsSchema>;

export const CreateAuthConfigResponseSchema = z.object({
  id: z.string(),
  authScheme: z.string(),
  isComposioManaged: z.boolean(),
  toolkit: z.string(),
});
export type CreateAuthConfigResponse = z.infer<typeof CreateAuthConfigResponseSchema>;

export const AuthConfigRetrieveResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  toolkit: z.object({
    logo: z.string(),
    slug: z.string(),
  }),
  noOfConnections: z.number(),
  status: z.enum(['ENABLED', 'DISABLED']),
  uuid: z.string(),
  authScheme: AuthSchemeEnum.optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  expectedInputFields: z.array(z.unknown()).optional(),
  isComposioManaged: z.boolean().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
});
export type AuthConfigRetrieveResponse = z.infer<typeof AuthConfigRetrieveResponseSchema>;

export const AuthConfigListParamsSchema = z.object({
  cursor: z.string().optional(),
  isComposioManaged: z.boolean().optional(),
  limit: z.number().optional(),
  toolkitSlug: z.string().optional(),
});
export type AuthConfigListParams = z.infer<typeof AuthConfigListParamsSchema>;

export const AuthConfigListResponseSchema = z.object({
  items: z.array(AuthConfigRetrieveResponseSchema),
  nextCursor: z.string().optional(),
  totalPages: z.number(),
});
export type AuthConfigListResponse = z.infer<typeof AuthConfigListResponseSchema>;

export const AuthCustomConfigUpdateParamsSchema = z.object({
  credentials: z.record(z.string(), z.union([z.string(), z.unknown()])),
  type: z.literal('custom'),
  restrictToFollowingTools: z.array(z.string()).optional(),
});

export const AuthDefaultConfigUpdateParamsSchema = z.object({
  scopes: z.string(),
  type: z.literal('default'),
  restrictToFollowingTools: z.array(z.string()).optional(),
});

export const AuthConfigUpdateParamsSchema = z.discriminatedUnion('type', [
  AuthCustomConfigUpdateParamsSchema,
  AuthDefaultConfigUpdateParamsSchema,
]);

export type AuthConfigUpdateParams = z.infer<typeof AuthConfigUpdateParamsSchema>;
