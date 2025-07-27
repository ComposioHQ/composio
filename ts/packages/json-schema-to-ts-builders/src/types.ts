import type { TypeBuilder } from '@composio/ts-builders';
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
export type ParserSelector = (schema: JsonSchemaObject, refs: Refs) => TypeBuilder;
export type ParserOverride = (schema: JsonSchemaObject, refs: Refs) => TypeBuilder | undefined;

export type JsonSchemaToTsOptions = {
  withoutDescriptions?: boolean;
  parserOverride?: ParserOverride;
  depth?: number;
  /**
   * Map to track generated helper types to avoid duplicates
   */
  generatedTypes?: Map<string, TypeBuilder>;
};

export type Refs = JsonSchemaToTsOptions & {
  path: Array<string | number>;
  seen: Map<object | boolean, { n: number; r: TypeBuilder | undefined }>;
};

export interface TypeDeclarationResult {
  /** The main type for this schema */
  type: TypeBuilder;
  /** Helper type declarations that need to be generated */
  declarations: Array<
    | {
        name: string;
        type: TypeBuilder;
        description?: string;
      }
    | import('@composio/ts-builders').TypeDeclaration
  >;
}
