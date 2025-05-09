import { z, ZodObject, ZodString, ZodNumber, ZodBoolean, ZodArray, ZodOptional } from 'zod';
import { Tool, ToolExecuteParams, ToolExecuteResponse } from './tool.types';
import { ToolProxyParams, ToolProxyResponse } from '@composio/client/resources/tools';
import { JsonSchema7Type } from 'zod-to-json-schema';

export type CustomToolInputParameter =
  | ZodObject<{
      [key: string]:
        | ZodString
        | ZodNumber
        | ZodBoolean
        | ZodOptional<ZodString | ZodNumber | ZodBoolean>;
    }>
  | ZodObject<{}>;

export type CustomToolInput<T extends CustomToolInputParameter> = {
  [K in keyof z.infer<T>]: z.infer<T>[K];
};

export interface CustomToolOptions<T extends CustomToolInputParameter = CustomToolInputParameter> {
  slug: string;
  name: string;
  toolkitSlug?: string | null;
  description?: string;
  inputParams: T;
  execute: (
    input: CustomToolInput<T>,
    authCredentials?: Record<string, unknown>,
    executeAppRequest?: (data: ToolProxyParams) => Promise<ToolProxyResponse>
  ) => Promise<ToolExecuteResponse>;
}

export type CustomToolRegistry = Map<
  string,
  {
    options: CustomToolOptions;
    schema: Tool;
  }
>;

export interface InputParamsSchema {
  definitions: {
    input: {
      properties: Record<string, JsonSchema7Type>;
      required?: string[];
    };
  };
}

export interface ExecuteMetadata {
  userId: string;
  connectedAccountId?: string;
}
