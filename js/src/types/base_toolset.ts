import { Client } from "@hey-api/client-axios";
import { z } from "zod";
import { ActionExecutionResDto } from "../sdk/client";

/*
    This is the schema for the raw action to be stored locally
    Also returned by the API
*/
export const ZRawActionSchema = z.object({
  name: z.string(),
  display_name: z.string(),
  description: z.string(),
  appKey: z.string(),
  appId: z.string(),
  appName: z.string(),
  logo: z.string(),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  parameters: z.object({
    type: z.string(),
    title: z.string(),
    description: z.string(),
    required: z.array(z.string()),
    properties: z.record(z.any()),
  }),
  response: z.record(z.any()),
  metadata: z.object({
    name: z.string(),
    toolName: z.string().optional(),
  }),
});

export type RawActionData = z.infer<typeof ZRawActionSchema>;

/*
    This is the schema for the params object in the ExecuteAction function
*/
export const ZExecuteActionParams = z.object({
  action: z.string(),
  params: z.record(z.any()).optional(),
  entityId: z.string().optional(),
  nlaText: z.string().optional(),
  connectedAccountId: z.string().optional(),
  config: z
    .object({
      labels: z.array(z.string()).optional(),
    })
    .optional(),
});

export type TPreProcessor = ({
  params,
}: {
  params: Record<string, unknown>;
  actionName: string;
  client: Client;
}) => Promise<Record<string, unknown>> | Record<string, unknown>;

export type TPostProcessor = ({
  actionName,
  toolResponse,
}: {
  actionName: string;
  toolResponse: ActionExecutionResDto;
}) => Promise<ActionExecutionResDto> | ActionExecutionResDto;

export type TSchemaProcessor = ({
  actionName,
  toolSchema,
}: {
  actionName: string;
  toolSchema: RawActionData;
}) => Promise<RawActionData> | RawActionData;

export const ZToolSchemaFilter = z.object({
  actions: z.array(z.string()).optional(),
  apps: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  useCase: z.string().optional(),
  useCaseLimit: z.number().optional(),
  filterByAvailableApps: z.boolean().optional(),
  integrationId: z.string().optional(),
});

export type TToolSchemaFilter = z.infer<typeof ZToolSchemaFilter>;
