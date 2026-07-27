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
          renderMarkdown: resolveRenderMarkdown(ctx),
          // fumadocs 11 renders from `bundled` documents, so `root` and its
          // nested properties can be unresolved `{ $ref }` nodes. The generator
          // needs the document's resolver to read through them.
          schema: { getRawRef, resolve: ctx.schema.resolve },
        }
      );
      // fumadocs 11 routes parameters, request bodies AND responses through this
      // hook (v10 rendered parameters with its own built-in components):
      //   parameter    -> client { name, required }               readOnly = method === 'get'
      //   request body -> client { name: 'body', as: 'body', … }  readOnly = method === 'get'
      //   response     -> client { name: 'response', as: 'body' } readOnly = true
      // `readOnly` is therefore also true for a GET's parameters and request body,
      // so it cannot identify a response on its own -- keying off it suppressed the
      // "Required" label on every required GET parameter. The client name can.
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
  /** @deprecated superseded by `components.Markdown` in fumadocs-openapi 11 */
  renderMarkdown?: (md: string) => ReactNode;
  /** @private fumadocs-internal fallback; not part of the public API */
  _default_processMarkdown?: (md: string) => ReactNode;
}

/**
 * Resolves the markdown renderer used by the schema generator, preferring
 * supported APIs and degrading safely if fumadocs removes its private field:
 *
 * 1. `components.Markdown` - the supported replacement (fumadocs-openapi 11+).
 *    It's a React FC, so it's adapted to the `(text) => ReactNode` shape.
 * 2. `renderMarkdown` - the deprecated user-configurable option, honoured if
 *    someone sets it.
 * 3. `_default_processMarkdown` - fumadocs' private default renderer. We
 *    don't set `components.Markdown` or `renderMarkdown` above, so this is
 *    what actually runs today; there's no supported default for this hook,
 *    so the private field stays in the chain until fumadocs adds one.
 * 4. A plain-text fallback so a future fumadocs release that drops the
 *    private field degrades to unformatted text instead of throwing.
 */
function resolveRenderMarkdown(ctx: MarkdownRenderSource): (text: string) => ReactNode {
  const Markdown = ctx.components?.Markdown;
  if (Markdown) {
    // Not a component definition despite returning an element -- it's the
    // `(text) => ReactNode` callback the schema generator invokes directly.
    // eslint-disable-next-line react/display-name -- render callback, never mounted as a component
    return (text: string) => createElement(Markdown, { md: text });
  }
  return ctx.renderMarkdown ?? ctx._default_processMarkdown ?? ((text) => text);
}
