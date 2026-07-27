import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CustomSchemaUI } from '../../components/custom-schema-ui';
import { generateSchemaData, getSchemaDisplayDescription } from '../../components/schema-generator';

describe('experimental API schema fields', () => {
  test('removes only a leading marker from flagged descriptions', () => {
    expect(
      getSchemaDisplayDescription('[EXPERIMENTAL] Whether to validate credentials', true)
    ).toBe('Whether to validate credentials');
    expect(
      getSchemaDisplayDescription('[Experimental] Whether to validate credentials', true)
    ).toBe('Whether to validate credentials');
    expect(getSchemaDisplayDescription('[EXPERIMENTAL] Unflagged source description', false)).toBe(
      '[EXPERIMENTAL] Unflagged source description'
    );
    expect(getSchemaDisplayDescription('Experimental behavior without a source marker', true)).toBe(
      'Experimental behavior without a source marker'
    );
  });

  test('renders one Experimental badge with clean field copy', () => {
    const generated = generateSchemaData(
      {
        root: {
          type: 'object',
          properties: {
            validate_credentials: {
              type: 'boolean',
              default: false,
              description: '[EXPERIMENTAL] Whether to validate the provided credentials',
              'x-experimental': true,
            },
          },
        },
      },
      {
        renderMarkdown: text => text,
        schema: { getRawRef: () => undefined, resolve: node => node },
      }
    );

    const html = renderToStaticMarkup(
      <CustomSchemaUI name="body" as="body" generated={generated} />
    );

    expect(html).toContain('validate_credentials');
    expect(html.match(/>Experimental<\/span>/g)).toHaveLength(1);
    expect(html).toContain('Whether to validate the provided credentials');
    expect(html).not.toContain('[EXPERIMENTAL]');
    expect(html).toContain('title="Experimental: these APIs may change in future releases"');
  });
});
