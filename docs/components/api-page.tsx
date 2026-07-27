'use client';

import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { generateSchemaData } from './schema-generator';
import { CustomSchemaUI } from './custom-schema-ui';

export const APIPage = createOpenAPIPage({
  generateTypeScriptDefinitions: false,
  playground: { enabled: true },
  schemaUI: {
    render: (options, ctx) => {
      const client = (
        options as typeof options & {
          client: { name: string; required?: boolean; as?: 'property' | 'body' };
        }
      ).client;
      // Skip rendering the shared Error schema on error responses -
      // the status code and description are shown by the accordion already
      // options.root can be boolean for simple schemas, only check refs for objects
      const ref =
        typeof options.root === 'object'
          ? getRawRef(options.root)
          : null;
      if (ref === '#/components/schemas/Error') return null;

      const generated = generateSchemaData(
        {
          root: options.root,
          readOnly: options.readOnly,
          writeOnly: options.writeOnly,
        },
        {
          renderMarkdown: ctx.renderMarkdown ?? ctx._default_processMarkdown,
          // fumadocs 11 renders from `bundled` documents, so `root` and its
          // nested properties can be unresolved `{ $ref }` nodes. The generator
          // needs the document's resolver to read through them.
          schema: { getRawRef, resolve: ctx.schema.resolve },
        }
      );
      const isResponse = options.readOnly === true && !options.writeOnly;
      return (
        <CustomSchemaUI
          name={client.name}
          required={client.required}
          as={client.as}
          generated={generated}
          isResponse={isResponse}
        />
      );
    },
  },
});

function getRawRef(value: object): string | undefined {
  if (!('$ref' in value)) return undefined;
  return typeof value.$ref === 'string' ? value.$ref : undefined;
}
