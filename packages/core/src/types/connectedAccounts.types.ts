import { z } from 'zod';

/**
 * Connected Account create parameters
 */
export const ConnectedAccountStatuses = {
  INITIALIZING: 'INITIALIZING',
  INITIATED: 'INITIATED',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export const ConnectedAccountStatusSchema = z.enum([
  ConnectedAccountStatuses.INITIALIZING,
  ConnectedAccountStatuses.INITIATED,
  ConnectedAccountStatuses.ACTIVE,
  ConnectedAccountStatuses.FAILED,
  ConnectedAccountStatuses.EXPIRED,
]);
export type ConnectedAccountStatus =
  (typeof ConnectedAccountStatuses)[keyof typeof ConnectedAccountStatuses];
export type ConnectedAccountStatusEnum = z.infer<typeof ConnectedAccountStatusSchema>;

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
export const DefaultCreateConnectedAccountParamsSchema = z.object({
  auth_config: z.object({
    id: z.string(),
  }),
  connection: z.object({
    data: z.record(z.string(), z.unknown()).optional(),
    callback_url: z.string().optional(),
    user_id: z.string().optional(),
  }),
});
export const CreateConnectedAccountOptionsSchema = z.object({
  callbackUrl: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type CreateConnectedAccountOptions = z.infer<typeof CreateConnectedAccountOptionsSchema>;
export type CreateConnectedAccountParams = z.infer<typeof CreateConnectedAccountParamsSchema>;
export type CreateConnectedAccountOptionsSchema = z.infer<
  typeof CreateConnectedAccountOptionsSchema
>;

/**
 * Connected Account create response
 */
export const CreateConnectedAccountResponseSchema = z.object({
  id: z.string(),
  status: ConnectedAccountStatusSchema,
  redirectUrl: z.string().nullable(),
});
export type CreateConnectedAccountResponse = z.infer<typeof CreateConnectedAccountResponseSchema>;

export const ConnectedAccountAuthSchemes = {
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
export const ConnectedAccountAuthSchemesSchema = z.enum([
  ConnectedAccountAuthSchemes.OAUTH2,
  ConnectedAccountAuthSchemes.OAUTH1,
  ConnectedAccountAuthSchemes.OAUTH1A,
  ConnectedAccountAuthSchemes.API_KEY,
  ConnectedAccountAuthSchemes.BASIC,
  ConnectedAccountAuthSchemes.BILLCOM_AUTH,
  ConnectedAccountAuthSchemes.BEARER_TOKEN,
  ConnectedAccountAuthSchemes.GOOGLE_SERVICE_ACCOUNT,
  ConnectedAccountAuthSchemes.NO_AUTH,
  ConnectedAccountAuthSchemes.BASIC_WITH_JWT,
  ConnectedAccountAuthSchemes.COMPOSIO_LINK,
  ConnectedAccountAuthSchemes.CALCOM_AUTH,
  ConnectedAccountAuthSchemes.SNOWFLAKE,
]);
export type ConnectedAccountAuthSchemesEnum = z.infer<typeof ConnectedAccountAuthSchemesSchema>;
export type ConnectedAccountAuthSchemes =
  (typeof ConnectedAccountAuthSchemes)[keyof typeof ConnectedAccountAuthSchemes];

export const ConnectedAccountAuthConfigSchema = z.object({
  id: z.string(),
  authScheme: ConnectedAccountAuthSchemesSchema,
  isComposioManaged: z.boolean(),
  isDisabled: z.boolean(),
});

export const ConnectedAccountRetrieveResponseSchema = z.object({
  id: z.string(),
  authConfig: ConnectedAccountAuthConfigSchema,
  userId: z.string(),
  data: z.record(z.string(), z.unknown()),
  params: z.record(z.string(), z.unknown()).optional(),
  status: ConnectedAccountStatusSchema,
  statusReason: z.string().nullable(),
  toolkit: z.object({
    slug: z.string(),
  }),
  testRequestEndpoint: z.string().optional(),
  isDisabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
// for some reason the list item doesn't have params
export const ConnectedAccountListResponseItemSchema = ConnectedAccountAuthConfigSchema;
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
  cursor: z
    .number()
    .nullable()
    .optional()
    .describe('The cursor to paginate through the connected accounts'),
  labels: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('The labels of the connected accounts'),
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
    .nullable()
    .describe('The next cursor to paginate through the connected accounts'),
  totalPages: z.number().describe('The total number of pages of connected accounts'),
});
export type ConnectedAccountListResponse = z.infer<typeof ConnectedAccountListResponseSchema>;
