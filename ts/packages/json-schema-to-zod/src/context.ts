import type { ZodBackend } from './backend/types';
import type { JsonSchema, JsonSchemaObject } from './types';

export type ParserOverrideOf<S> = (schema: JsonSchemaObject, refs: RefsOf<S>) => S | undefined;

export type OptionsOf<S> = {
  withoutDefaults?: boolean;
  withoutDescribes?: boolean;
  parserOverride?: ParserOverrideOf<S>;
  depth?: number;
};

export type RefsOf<S> = OptionsOf<S> & {
  path: Array<string | number>;
  seen: Map<object | boolean, { n: number; r: S | undefined }>;
  /** The document that local `$ref` pointers resolve against. */
  root?: JsonSchema;
};

/** What every parser receives: the references plus the builder that turns JSON Schema into `S`. */
export type ParseContext<S> = RefsOf<S> & {
  readonly backend: ZodBackend<S>;
  /** Suppresses the JSON Schema annotations a backend would otherwise carry. */
  readonly withoutAnnotations?: boolean;
};
