import { ASSERTED_STRING_FORMATS, type StringFormat } from './backend/types';
import type { JsonSchemaObject, Serializable } from './types';
import { its } from './utils/its';

const ASSERTED_FORMAT_SET: ReadonlySet<StringFormat> = new Set<StringFormat>(
  ASSERTED_STRING_FORMATS
);

export const isAssertedStringFormat = (format: unknown): format is StringFormat =>
  typeof format === 'string' && ASSERTED_FORMAT_SET.has(format as StringFormat);

/**
 * The description text a node carries: its `description`, else its `title`,
 * followed by the `example` or `examples` it declares. `undefined` when there
 * is nothing to say.
 */
export const describeText = (jsonSchema: JsonSchemaObject): string | undefined => {
  let description = '';

  if (jsonSchema.description) {
    description = jsonSchema.description;
  } else if (jsonSchema.title) {
    description = jsonSchema.title;
  }

  if (jsonSchema.example !== undefined) {
    const exampleText = `Example: ${JSON.stringify(jsonSchema.example)}`;
    description = description ? `${description}\n${exampleText}` : exampleText;
  } else if (jsonSchema.examples !== undefined && Array.isArray(jsonSchema.examples)) {
    const examples = jsonSchema.examples;
    if (examples.length > 0) {
      const exampleText =
        examples.length === 1
          ? `Example: ${JSON.stringify(examples[0])}`
          : `Examples:\n${examples.map((ex: unknown) => `  ${JSON.stringify(ex)}`).join('\n')}`;
      description = description ? `${description}\n${exampleText}` : exampleText;
    }
  }

  return description || undefined;
};

/** Whether the number parser applies its integer check to this node. */
const isIntegerNumber = (jsonSchema: JsonSchemaObject): boolean =>
  its.a.primitive(jsonSchema, 'integer') ||
  (its.a.primitive(jsonSchema, 'number') &&
    (jsonSchema.format === 'int64' || jsonSchema.multipleOf === 1));

/**
 * The JSON Schema annotations a node carries beyond what its checks imply:
 * `format`, `contentEncoding`, and `contentMediaType` verbatim, and
 * `type: "integer"` wherever the integer check applies, since that check is
 * a refinement a serializer cannot see. Everything else the serializer
 * derives from the checks themselves, or is deliberately left out.
 */
export const collectAnnotations = (
  jsonSchema: JsonSchemaObject
): Readonly<Record<string, Serializable>> | undefined => {
  // Draft 7 ignores the keywords next to `$ref`, so none of them describe the value.
  if ('$ref' in jsonSchema) {
    return undefined;
  }

  const annotations: Record<string, Serializable> = {};

  if (typeof jsonSchema.format === 'string') {
    annotations.format = jsonSchema.format;
  }
  if (typeof jsonSchema.contentEncoding === 'string') {
    annotations.contentEncoding = jsonSchema.contentEncoding;
  }
  if (typeof jsonSchema.contentMediaType === 'string') {
    annotations.contentMediaType = jsonSchema.contentMediaType;
  }
  if (isIntegerNumber(jsonSchema)) {
    annotations.type = 'integer';
  }

  return Object.keys(annotations).length > 0 ? annotations : undefined;
};
