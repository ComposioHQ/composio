import { z } from "zod";

export const ZExecuteActionParams = z.object({
  actionName: z.string(),
  params: z.record(z.any()).optional(),
  text: z.string().optional(),
  connectedAccountId: z.string().optional(),
});

export const ZInitiateConnectionParams = z.object({
  appName: z.string().optional(),
  authConfig: z.record(z.any()).optional(),
  integrationId: z.string().optional(),
  authMode: z.string().optional(),
  connectionData: z.record(z.any()).optional(),
  config: z
    .object({
      labels: z.array(z.string()).optional(),
      redirectUrl: z.string().optional(),
    })
    .optional(),
});

export const ZConnectionParams = z.object({
  connectedAccountId: z.string().optional(),
  app: z.string().optional(),
});

export const ZTriggerSubscribeParam = z.object({
  app: z.string(),
  triggerName: z.string(),
  config: z.record(z.any()),
});
