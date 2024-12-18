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
    actionName: z.string(),
    toolName: z.string(),
  }),
});

export type TRawActionData = z.infer<typeof ZRawActionSchema>;

/*
    This is the schema for the params object in the ExecuteAction function
*/
export const ZExecuteActionParams = z.object({
  action: z.string(),
  params: z.record(z.any()).optional(),
  entityId: z.string(),
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
  appName: string;
}) => Record<string, unknown>;

export type TPostProcessor = ({
  actionName,
  appName,
  toolResponse,
}: {
  actionName: string;
  appName: string;
  toolResponse: ActionExecutionResDto;
}) => ActionExecutionResDto;

export type TSchemaProcessor = ({
  actionName,
  appName,
  toolSchema,
}: {
  actionName: string;
  appName: string;
  toolSchema: TRawActionData;
}) => TRawActionData;

export const ZToolSchemaFilter = z.object({
  actions: z.array(z.string()).optional(),
  apps: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  useCase: z.string().optional(),
  useCaseLimit: z.number().optional(),
  filterByAvailableApps: z.boolean().optional(),
});

export type TToolSchemaFilter = z.infer<typeof ZToolSchemaFilter>;
