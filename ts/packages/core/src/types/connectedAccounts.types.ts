import { z } from 'zod';
import { ConnectionDataSchema } from './connectedAccountAuthStates.types';

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
    state: ConnectionDataSchema.optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    callback_url: z.string().optional(),
    user_id: z.string().optional(),
  }),
});

export const CreateConnectedAccountOptionsSchema = z.object({
  allowMultiple: z.boolean().optional(),
  callbackUrl: z.string().optional(),
  config: ConnectionDataSchema.optional(),
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
  isComposioManaged: z.boolean(),
  isDisabled: z.boolean(),
});
export type ConnectedAccountAuthConfig = z.infer<typeof ConnectedAccountAuthConfigSchema>;

export const ConnectedAccountRetrieveResponseSchema = z.object({
  id: z.string(),
  authConfig: ConnectedAccountAuthConfigSchema,
  data: z.record(z.string(), z.unknown()),
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
