import { z } from 'zod/v3';

export const AuthConfigTypes = {
  CUSTOM: 'use_custom_auth',
  COMPOSIO_MANAGED: 'use_composio_managed_auth',
} as const;
export type AuthConfigType = (typeof AuthConfigTypes)[keyof typeof AuthConfigTypes];

export const AuthSchemeTypes = {
  OAUTH1: 'OAUTH1',
  OAUTH2: 'OAUTH2',
  API_KEY: 'API_KEY',
  BASIC: 'BASIC',
  BEARER_TOKEN: 'BEARER_TOKEN',
  BILLCOM_AUTH: 'BILLCOM_AUTH',
  GOOGLE_SERVICE_ACCOUNT: 'GOOGLE_SERVICE_ACCOUNT',
  NO_AUTH: 'NO_AUTH',
  BASIC_WITH_JWT: 'BASIC_WITH_JWT',
  CALCOM_AUTH: 'CALCOM_AUTH',
  SERVICE_ACCOUNT: 'SERVICE_ACCOUNT',
  SAML: 'SAML',
  DCR_OAUTH: 'DCR_OAUTH',
} as const;
export type AuthSchemeType = (typeof AuthSchemeTypes)[keyof typeof AuthSchemeTypes];

export const AuthConfigCreationToolAccessConfigSchema = z.object({
  toolsForConnectedAccountCreation: z.array(z.string()).optional(),
});

export const AuthConfigToolAccessConfigSchema = z.object({
  toolsAvailableForExecution: z.array(z.string()).optional(),
  toolsForConnectedAccountCreation: z.array(z.string()).optional(),
});

export const AuthSchemeEnum = z.enum([
  'OAUTH2',
  'OAUTH1',
  'API_KEY',
  'BASIC',
  'BILLCOM_AUTH',
  'BEARER_TOKEN',
  'GOOGLE_SERVICE_ACCOUNT',
  'NO_AUTH',
  'BASIC_WITH_JWT',
  'CALCOM_AUTH',
  'SERVICE_ACCOUNT',
  'SAML',
  'DCR_OAUTH',
]);
export const CreateCustomAuthConfigParamsSchema = z.object({
  type: z.literal('use_custom_auth'),
  name: z.string().optional(),
  credentials: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  authScheme: AuthSchemeEnum,
  proxyConfig: z
    .object({
      proxyUrl: z.string(),
      proxyAuthKey: z.string().optional(),
    })
    .optional(),
  toolAccessConfig: AuthConfigCreationToolAccessConfigSchema.optional(),
});

export const CreateComposioManagedAuthConfigParamsSchema = z.object({
  type: z.literal('use_composio_managed_auth'),
  name: z.string().optional(),
  credentials: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  toolAccessConfig: AuthConfigCreationToolAccessConfigSchema.optional(),
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
  /**
   * @deprecated - use tool access config to determine the tools that the user can perform on the auth config.
   */
  restrictToFollowingTools: z.array(z.string()).optional(),
  isComposioManaged: z.boolean().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
  toolAccessConfig: AuthConfigToolAccessConfigSchema.optional(),
});
export type AuthConfigRetrieveResponse = z.infer<typeof AuthConfigRetrieveResponseSchema>;

export const AuthConfigListParamsSchema = z.object({
  cursor: z.string().optional(),
  isComposioManaged: z.boolean().optional(),
  limit: z.number().optional(),
  toolkit: z.string().optional(),
});
export type AuthConfigListParams = z.infer<typeof AuthConfigListParamsSchema>;

export const AuthConfigListResponseSchema = z.object({
  items: z.array(AuthConfigRetrieveResponseSchema),
  nextCursor: z.string().nullable(),
  totalPages: z.number(),
});
export type AuthConfigListResponse = z.infer<typeof AuthConfigListResponseSchema>;

export const AuthCustomConfigUpdateParamsSchema = z.object({
  type: z.literal('custom'),
  credentials: z.record(z.string(), z.union([z.string(), z.unknown()])).optional(),
  proxyConfig: z
    .object({
      proxyUrl: z.string(),
      proxyAuthKey: z.string().optional(),
    })
    .optional()
    .nullable(),
  sharedCredentials: z.record(z.unknown()).optional(),
  /**
   * @deprecated - use tool access config to determine the tools that the user can perform on the auth config.
   */
  restrictToFollowingTools: z.array(z.string()).optional(),
  toolAccessConfig: AuthConfigToolAccessConfigSchema.optional(),
});

export const AuthDefaultConfigUpdateParamsSchema = z.object({
  type: z.literal('default'),
  scopes: z.string().optional(),
  sharedCredentials: z.record(z.unknown()).optional(),
  /**
   * @deprecated - use tool access config to determine the tools that the user can perform on the auth config.
   */
  restrictToFollowingTools: z.array(z.string()).optional(),
  toolAccessConfig: AuthConfigToolAccessConfigSchema.optional(),
});

export const AuthConfigUpdateParamsSchema = z.discriminatedUnion('type', [
  AuthCustomConfigUpdateParamsSchema,
  AuthDefaultConfigUpdateParamsSchema,
]);

export type AuthConfigUpdateParams = z.infer<typeof AuthConfigUpdateParamsSchema>;
