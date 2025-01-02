import { z } from "zod";

export const ZTriggerQuery = z.object({
  triggerIds: z.array(z.string()).optional().describe("Trigger Instance IDs"),
  triggerInstanceIds: z
    .array(z.string())
    .optional()
    .describe("Trigger Instance IDs"),
  appNames: z.array(z.string()).optional().describe("App Names in lowercase"),
  connectedAccountIds: z
    .array(z.string())
    .optional()
    .describe("Connected Account UUIDs"),
  integrationIds: z.array(z.string()).optional().describe("Integration IDs"),
  showEnabledOnly: z
    .boolean()
    .optional()
    .describe("Show Enabled triggers only"),
});

export const ZTriggerInstanceItems = z.object({
  triggerInstanceId: z.string(),
});

export const ZTriggerSetupParam = z.object({
  connectedAccountId: z.string(),
  triggerName: z.string(),
  config: z.record(z.unknown()).optional(),
});

export type TriggerListParam = z.infer<typeof ZTriggerQuery>;
export type TriggerSetupParam = z.infer<typeof ZTriggerSetupParam>;

export const ZTriggerSubscribeParam = z.object({
  appName: z.string().optional(),
  triggerId: z.string().optional(),
  connectionId: z.string().optional(),
  integrationId: z.string().optional(),
  triggerName: z.string().optional(),
  triggerData: z.string().optional(),
  entityId: z.string().optional(),
});

export const ZSingleTriggerParam = z.object({
  triggerId: z.string(),
});

export type TriggerSingleParam = z.infer<typeof ZSingleTriggerParam>;

export const ZSingleTriggerRes = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  type: z.string(),
  appId: z.string(),
  appName: z.string(),
  instructions: z.string().optional(),
  payload: z.record(z.unknown()),
  config: z.record(z.unknown()),
});
