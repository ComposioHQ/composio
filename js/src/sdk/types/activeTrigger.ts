import { z } from "zod";

export const ZTriggerItemParam = z.object({
  triggerId: z.string(),
});

export const ZActiveTriggersQuery = z.object({
  triggerIds: z.string().optional(),
  triggerNames: z.string().optional(),
  connectedAccountIds: z.string().optional(),
  integrationIds: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  showDisabled: z.boolean().optional(),
});

const ZConnection = z.object({
  id: z.string(),
  integrationId: z.string(),
  memberId: z.string(),
  clientUniqueUserId: z.string(),
  status: z.string(),
  data: z.record(z.unknown()),
  deleted: z.boolean().optional(),
  enabled: z.boolean(),
  labels: z.array(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ZActiveTriggerItemRes = z.object({
  id: z.string(),
  connectionId: z.string(),
  triggerName: z.string(),
  triggerData: z.string(),
  triggerConfig: z.record(z.unknown()),
  state: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  disabledAt: z.string().nullable(),
  disabledReason: z.string().nullable(),
  connection: ZConnection,
});
