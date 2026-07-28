'use client';

import { createElement, type FC, type ReactNode } from 'react';
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
      const ref = typeof options.root === 'object' ? getRawRef(options.root) : null;
      if (ref === '#/components/schemas/Error') return null;

      const generated = generateSchemaData(
        {
          // Fumadocs' public type permits non-string `type` values even though
          // JSON Schema does not; the renderer's local type keeps that contract strict.
          root: options.root as Parameters<typeof generateSchemaData>[0]['root'],
          readOnly: options.readOnly,
          writeOnly: options.writeOnly,
        },
        {
          renderMarkdown: resolveRenderMarkdown(ctx),
          // Schema nodes can be unresolved Reference Objects.
          schema: { getRawRef, resolve: ctx.schema.resolve },
        }
      );
      // Parameters, request bodies, and responses all pass through this hook:
      //   parameter    -> client { name, required }               readOnly = method === 'get'
      //   request body -> client { name: 'body', as: 'body', … }  readOnly = method === 'get'
      //   response     -> client { name: 'response', as: 'body' } readOnly = true
      // `readOnly` cannot distinguish GET inputs from responses; the client name can.
      const isResponse = client.name === 'response';
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

// Structural subset of fumadocs-openapi's `RenderContext` covering only the
// markdown-rendering fields we read below. Kept narrow (instead of importing
// the internal `RenderContext` type) so this stays valid against whatever
// shape `ctx` actually has at the call site.
interface MarkdownRenderSource {
  components?: { Markdown?: FC<{ md: string }> };
  /** @deprecated Prefer `components.Markdown`. */
  renderMarkdown?: (md: string) => ReactNode;
  /** @private fumadocs-internal fallback; not part of the public API */
  _default_processMarkdown?: (md: string) => ReactNode;
}

/**
 * Resolves the markdown renderer used by the schema generator, preferring
 * supported APIs and degrading safely if fumadocs removes its private field:
 *
 * 1. `components.Markdown` - adapted from a React FC to `(text) => ReactNode`.
 * 2. `renderMarkdown` - the deprecated user-configurable option, honoured if
 *    someone sets it.
 * 3. `_default_processMarkdown` - fumadocs' private default renderer.
 * 4. Plain text - avoids throwing if no renderer is available.
 */
function resolveRenderMarkdown(ctx: MarkdownRenderSource): (text: string) => ReactNode {
  const Markdown = ctx.components?.Markdown;
  if (Markdown) {
    // Not a component definition despite returning an element -- it's the
    // `(text) => ReactNode` callback the schema generator invokes directly.
    // eslint-disable-next-line react/display-name -- render callback, never mounted as a component
    return (text: string) => createElement(Markdown, { md: text });
  }
  return ctx.renderMarkdown ?? ctx._default_processMarkdown ?? (text => text);
}
