import type { StringFormat } from './backend/types';
import type { JsonSchemaObject } from './types';

export const ASSERTED_STRING_FORMATS: ReadonlySet<StringFormat> = new Set<StringFormat>([
  'email',
  'ip',
  'ipv4',
  'ipv6',
  'uri',
  'uuid',
  'date-time',
  'time',
  'date',
  'duration',
]);

export const isAssertedStringFormat = (format: unknown): format is StringFormat =>
  typeof format === 'string' && ASSERTED_STRING_FORMATS.has(format as StringFormat);

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
