import { z } from 'zod';
import { Tool, ToolProxyParams } from './tool.types';
import { ToolExecuteResponse } from '@composio/client/resources/tools';
import { ConnectionData } from './connectedAccountAuthStates.types';

type BaseCustomToolOptions<T extends z.ZodType> = {
  name: string;
  description?: string;
  slug: string;
  inputParams: T;
};

type ToolkitBasedExecute<T extends z.ZodType> = {
  execute: (
    input: z.infer<T>,
    connectionConfig: ConnectionData | null,
    executeToolRequest: (data: ToolProxyParams) => Promise<ToolExecuteResponse>
  ) => Promise<ToolExecuteResponse>;
  toolkitSlug: string;
};

type StandaloneExecute<T extends z.ZodType> = {
  execute: (input: z.infer<T>) => Promise<ToolExecuteResponse>;
  toolkitSlug?: never;
};

export type CustomToolOptions<T extends z.ZodType> = BaseCustomToolOptions<T> &
  (ToolkitBasedExecute<T> | StandaloneExecute<T>);

export type CustomToolRegistry = Map<
  string,
  { options: CustomToolOptions<CustomToolInputParameter>; schema: Tool }
>;

export type InputParamsSchema = {
  definitions: {
    input: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export type CustomToolInputParameter = z.ZodType;

export interface CustomToolRegistryItem {
  options: CustomToolOptions<CustomToolInputParameter>;
  schema: Tool;
}

export interface ExecuteMetadata {
  userId: string;
  connectedAccountId?: string;
}
