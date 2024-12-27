import { z } from "zod";
import { ZAuthMode } from "./integration";

export const ZConnectionStatus = z.enum(["INITIATED", "ACTIVE", "FAILED"]);

export const ZListConnectionsData = z.object({
  appNames: z.string().optional(),
  connectionId: z.string().optional(),
  entityId: z.string().optional(),
  integrationId: z.string().optional(),
  labels: z.string().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  showActiveOnly: z.boolean().optional(),
  showDisabled: z.boolean().optional(),
  status: ZConnectionStatus.optional(),
  user_uuid: z.string().optional(),
});

export const ZInitiateConnectionDataReq = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  entityId: z.string().optional(),
  labels: z.string().array().optional(),
  integrationId: z.string().optional(),
  redirectUri: z.string().optional(),
  authMode: ZAuthMode.optional(),
  authConfig: z.record(z.string(), z.unknown()).optional(),
  appName: z.string().optional(),
});

export const ZSaveUserAccessDataParam = z.object({
  fieldInputs: z.record(z.string(), z.unknown()),
  redirectUrl: z.string().optional(),
  entityId: z.string().optional(),
});

export const ZSingleConnectionParams = z.object({
  connectedAccountId: z.string(),
});

export type InitiateConnectionDataReq = z.infer<
  typeof ZInitiateConnectionDataReq
>;

export const ZInitiateConnectionPayloadDto = z.object({
  data: z.record(z.string(), z.unknown()),
  integrationId: z.string(),
  redirectUri: z.string().optional(),
  userUuid: z.string().optional(),
  entityId: z.string().optional(),
  labels: z.string().array().optional(),
});
