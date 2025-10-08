import type { ZodTypeAny } from 'zod/v3';
import type { JSONSchema7 } from 'json-schema';

export type Serializable =
  | { [key: string]: Serializable }
  | Serializable[]
  | string
  | number
  | boolean
  | null;

export type JsonSchema = JsonSchemaObject | boolean;
export type JsonSchemaObject = JSONSchema7;
export type ParserSelector = (schema: JsonSchemaObject, refs: Refs) => ZodTypeAny;
export type ParserOverride = (schema: JsonSchemaObject, refs: Refs) => ZodTypeAny | undefined;

export type JsonSchemaToZodOptions = {
  withoutDefaults?: boolean;
  withoutDescribes?: boolean;
  parserOverride?: ParserOverride;
  depth?: number;
};

export type Refs = JsonSchemaToZodOptions & {
  path: Array<string | number>;
  seen: Map<object | boolean, { n: number; r: ZodTypeAny | undefined }>;
};
