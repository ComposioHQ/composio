import type { ZodTypeAny } from 'zod/v3';
import type { JSONSchema7 } from 'json-schema';

export type Serializable =
  { [key: string]: Serializable } | Serializable[] | string | number | boolean | null;

export type JsonSchema = JsonSchemaObject | boolean;

type JsonSchemaDefinitions = Record<string, JsonSchema>;

export interface JsonSchemaObject extends Omit<
  JSONSchema7,
  | '$defs'
  | 'items'
  | 'additionalItems'
  | 'contains'
  | 'properties'
  | 'patternProperties'
  | 'additionalProperties'
  | 'dependencies'
  | 'propertyNames'
  | 'if'
  | 'then'
  | 'else'
  | 'allOf'
  | 'anyOf'
  | 'oneOf'
  | 'not'
  | 'definitions'
> {
  min?: number;
  max?: number;
  example?: Serializable;

  $defs?: JsonSchemaDefinitions;
  definitions?: JsonSchemaDefinitions;
  items?: JsonSchema | JsonSchema[];
  additionalItems?: JsonSchema;
  contains?: JsonSchema;
  properties?: JsonSchemaDefinitions;
  patternProperties?: JsonSchemaDefinitions;
  additionalProperties?: JsonSchema;
  dependencies?: Record<string, JsonSchema | string[]>;
  propertyNames?: JsonSchema;
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;
}
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
