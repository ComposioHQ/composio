import { z } from "zod";

export const ZActionGetParams = z.object({
  actionName: z.string(),
});

export const ZGetListActionsParams = z.object({
  apps: z.string().optional().describe("Comma separated app names"),
  actions: z.string().optional().describe("Comma separated action names"),
  tags: z.string().optional().describe("Comma separated tag names"),
  useCase: z.string().nullable().optional().describe("Use case name"),
  usecaseLimit: z.number().optional().describe("Limit for use case"),
  showAll: z.boolean().optional().describe("Show all actions"),
  showEnabledOnly: z.boolean().optional().describe("Show enabled actions"),
  filterImportantActions: z
    .boolean()
    .optional()
    .describe("Filter important actions"),
  filterByAvailableApps: z
    .boolean()
    .optional()
    .describe("Filter actions by available apps"),
});

export const ZParameter = z.object({
  name: z.string(),
  in: z.enum(["query", "header"]),
  value: z.string(),
});

export const ZCustomAuthParams = z.object({
  base_url: z.string().optional(),
  parameters: z.array(ZParameter),
  body: z.record(z.unknown()).optional(),
});

export const ZExecuteParams = z.object({
  actionName: z.string(),
  requestBody: z.object({
    connectedAccountId: z.string().optional(),
    input: z.record(z.unknown()).optional(),
    appName: z.string().optional(),
    text: z.string().optional(),
    authConfig: ZCustomAuthParams.optional(),
  }),
});

export const ZFindActionEnumsByUseCaseParams = z.object({
  apps: z.array(z.string()),
  useCase: z.string(),
  limit: z.number().optional(),
  filterByAvailableApps: z.boolean().optional(),
});

export const ZExecuteRequestParams = z.object({
  connectedAccountId: z.string(),
  endpoint: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  parameters: z.array(ZParameter),
  body: z.record(z.unknown()).optional(),
});
