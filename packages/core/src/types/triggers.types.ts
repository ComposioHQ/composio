import { z } from 'zod';

export const TriggerStatuses = {
  ENABLE: 'enable',
  DISABLE: 'disable',
} as const;
export type TriggerStatusType = (typeof TriggerStatuses)[keyof typeof TriggerStatuses];
export const TriggerStatusEnum = z.enum(['enable', 'disable']);

export const TriggerSubscribeParamSchema = z.object({
  toolkits: z.array(z.string()).optional(),
  triggerId: z.string().optional(),
  connectedAccountId: z.string().optional(),
  authConfigId: z.string().optional(),
  triggerSlug: z.array(z.string()).optional(),
  triggerData: z.string().optional(),
  userId: z.string().optional(),
});
export type TriggerSubscribeParams = z.infer<typeof TriggerSubscribeParamSchema>;

export const TriggerInstanceListActiveParamsSchema = z.object({
  authConfigIds: z.array(z.string()).nullable().optional(),
  connectedAccountIds: z.array(z.string()).nullable().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  showDisabled: z.boolean().nullable().optional(),
  triggerIds: z.array(z.string()).nullable().optional(),
  triggerNames: z.array(z.string()).nullable().optional(),
});

export type TriggerInstanceListActiveParams = z.infer<typeof TriggerInstanceListActiveParamsSchema>;

export const TriggerInstanceListActiveResponseItemSchema = z.object({
  id: z.string(),
  connectedAccountId: z.string(),
  disabledAt: z.string().nullable(),
  state: z.record(z.unknown()),
  triggerConfig: z.record(z.unknown()),
  triggerName: z.string(),
  updatedAt: z.string(),
  triggerData: z.string().optional(),
  uuid: z.string().optional(),
});

export const TriggerInstanceListActiveResponseSchema = z.object({
  items: z.array(TriggerInstanceListActiveResponseItemSchema),
  nextCursor: z.string().nullable(),
  totalPages: z.number(),
});

export type TriggerInstanceListActiveResponse = z.infer<
  typeof TriggerInstanceListActiveResponseSchema
>;
export type TriggerInstanceListActiveResponseItem = z.infer<
  typeof TriggerInstanceListActiveResponseItemSchema
>;

export const TriggerInstanceUpsertParamsSchema = z.object({
  connectedAccountId: z.string().optional(),
  triggerConfig: z.record(z.unknown()).optional(),
});

export type TriggerInstanceUpsertParams = z.infer<typeof TriggerInstanceUpsertParamsSchema>;

export const TriggerInstanceUpsertResponseSchema = z.object({
  triggerId: z.string(),
});

export type TriggerInstanceUpsertResponse = z.infer<typeof TriggerInstanceUpsertResponseSchema>;

export const TriggerInstanceManageUpdateParamsSchema = z.object({
  status: z.enum(['enable', 'disable']),
});

export type TriggerInstanceManageUpdateParams = z.infer<
  typeof TriggerInstanceManageUpdateParamsSchema
>;

export const TriggerInstanceManageUpdateResponseSchema = z.object({
  status: z.enum(['success']),
});

export type TriggerInstanceManageUpdateResponse = z.infer<
  typeof TriggerInstanceManageUpdateResponseSchema
>;

export const TriggerInstanceManageDeleteResponseSchema = z.object({
  triggerId: z.string(),
});

export type TriggerInstanceManageDeleteResponse = z.infer<
  typeof TriggerInstanceManageDeleteResponseSchema
>;

export const IncomingTriggerPayloadSchema = z.object({
  id: z.string().describe('The ID of the trigger'),
  triggerSlug: z.string().describe('The slug of the trigger that triggered the event'),
  toolkitSlug: z.string().describe('The slug of the toolkit that triggered the event'),
  userId: z.string().describe('The ID of the user that triggered the event'),
  payload: z.record(z.unknown()).describe('The payload of the trigger'),
  originalPayload: z.record(z.unknown()).describe('The original payload of the trigger'),
  metadata: z.object({
    id: z.string(),
    toolkitSlug: z.string(),
    triggerSlug: z.string(),
    triggerData: z.string().optional(),
    triggerConfig: z.record(z.unknown()),
    connectedAccount: z.object({
      id: z.string(),
      uuid: z.string(),
      authConfigId: z.string(),
      authConfigUUID: z.string(),
      userId: z.string(),
      status: z.enum(['ACTIVE', 'INACTIVE']),
    }),
  }),
});

export type IncomingTriggerPayload = z.infer<typeof IncomingTriggerPayloadSchema>;

export type TriggerData = {
  appName: string;
  clientId: number;
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown>;
  metadata: {
    id: string;
    triggerName: string;
    triggerData: string;
    triggerConfig: Record<string, unknown>;
    connection: {
      id: string;
      connectedAccountNanoId: string;
      integrationId: string;
      authConfigNanoId: string;
      clientUniqueUserId: string;
      status: string;
    };
  };
};
