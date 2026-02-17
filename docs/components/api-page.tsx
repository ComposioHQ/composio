import { openapi } from '@/lib/openapi';
import { createAPIPage } from 'fumadocs-openapi/ui';
import client from './api-page.client';
import { generateSchemaData } from './schema-generator';
import { CustomSchemaUI } from './custom-schema-ui';

export const APIPage = createAPIPage(openapi, {
  client,
  generateTypeScriptSchema: false,
  playground: { enabled: true },
  schemaUI: {
    render: (options, ctx) => {
      // Skip rendering the shared Error schema on error responses -
      // the status code and description are shown by the accordion already
      // options.root can be boolean for simple schemas, only check refs for objects
      const ref =
        typeof options.root === 'object'
          ? ctx.schema.getRawRef(options.root)
          : null;
      if (ref === '#/components/schemas/Error') return null;

      const generated = generateSchemaData(
        {
          root: options.root,
          readOnly: options.readOnly,
          writeOnly: options.writeOnly,
        },
        {
          renderMarkdown: ctx.renderMarkdown,
          schema: { getRawRef: ctx.schema.getRawRef },
        }
      );
      const isResponse = options.readOnly === true && !options.writeOnly;
      return (
        <CustomSchemaUI
          name={options.client.name}
          required={options.client.required}
          as={options.client.as}
          generated={generated}
          isResponse={isResponse}
        />
      );
    },
  },
});
