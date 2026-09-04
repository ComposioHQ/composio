// Fumadocs passes its bundled OpenAPI document to a client component. This
// module trims that payload to the operations or webhooks on one reference page.

import type { OpenAPIPageProps } from 'fumadocs-openapi/ui';

export interface PageOperation {
  path: string;
  method: string;
}

export interface PageWebhook {
  name: string;
  method: string;
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

// Path-item keys that must travel with a kept operation.
const SHARED_PATH_ITEM_KEYS = ['parameters', 'servers', 'summary', 'description'];

interface SliceableDocument {
  paths?: Record<string, object | undefined>;
  webhooks?: Record<string, object | undefined>;
  components?: {
    securitySchemes?: Record<string, unknown>;
  };
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolvePointer(document: unknown, ref: string): unknown {
  let node = document;

  for (const segment of ref.slice(2).split('/')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[decodePointerSegment(segment)];
  }

  return node;
}

/**
 * Collects every `#/components/...` pointer reachable from `node`, following
 * references transitively. Returns null if a non-component internal reference
 * is found, signalling the caller to keep the whole document.
 */
function collectComponentRefs(
  document: unknown,
  node: unknown,
  found: Set<string>
): Set<string> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      if (!collectComponentRefs(document, item, found)) return null;
    }
    return found;
  }

  if (node === null || typeof node !== 'object') return found;

  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      // External references are resolved before bundling; leave them alone.
      if (!value.startsWith('#/')) continue;
      if (!value.startsWith('#/components/')) return null;
      if (found.has(value)) continue;

      found.add(value);
      if (!collectComponentRefs(document, resolvePointer(document, value), found)) {
        return null;
      }
      continue;
    }

    if (!collectComponentRefs(document, value, found)) return null;
  }

  return found;
}

function pickOperations(
  pathItem: object,
  methods: Set<string>
): Record<string, unknown> | undefined {
  const kept: Record<string, unknown> = {};
  let matched = false;

  for (const [key, value] of Object.entries(pathItem)) {
    if (HTTP_METHODS.has(key.toLowerCase())) {
      if (!methods.has(key.toLowerCase())) continue;
      kept[key] = value;
      matched = true;
      continue;
    }
    if (SHARED_PATH_ITEM_KEYS.includes(key)) kept[key] = value;
  }

  return matched ? kept : undefined;
}

function groupByKey<T extends { method: string }>(
  entries: T[],
  keyOf: (entry: T) => string
): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const methods = grouped.get(key) ?? new Set<string>();
    methods.add(entry.method.toLowerCase());
    grouped.set(key, methods);
  }
  return grouped;
}

/**
 * Returns a self-contained document containing the selected operations or
 * webhooks and every component they reference transitively.
 *
 * When the requested operation is missing or a reference cannot be represented
 * safely, the original document is returned instead of a partial slice.
 */
export function sliceDocumentForPage<T extends object>(
  bundled: T,
  operations: PageOperation[] = [],
  webhooks: PageWebhook[] = []
): T {
  if (operations.length === 0 && webhooks.length === 0) return bundled;

  const document = bundled as T & SliceableDocument;
  const paths: Record<string, unknown> = {};
  for (const [path, methods] of groupByKey(operations, op => op.path)) {
    const pathItem = document.paths?.[path];
    if (!pathItem) return bundled; // Unexpected shape -- do not risk a partial document.
    const kept = pickOperations(pathItem, methods);
    if (!kept) return bundled;
    paths[path] = kept;
  }

  const keptWebhooks: Record<string, unknown> = {};
  for (const [name, methods] of groupByKey(webhooks, hook => hook.name)) {
    const webhookItem = document.webhooks?.[name];
    if (!webhookItem) return bundled;
    const kept = pickOperations(webhookItem, methods);
    if (!kept) return bundled;
    keptWebhooks[name] = kept;
  }

  const refs = collectComponentRefs(bundled, { paths, webhooks: keptWebhooks }, new Set());
  if (!refs) return bundled; // Non-component internal reference -- keep everything.

  const components: Record<string, Record<string, unknown>> = {};
  for (const ref of refs) {
    const [, , group, ...rest] = ref.split('/');
    if (!group || rest.length !== 1) return bundled;
    const name = decodePointerSegment(rest[0]);
    const value = resolvePointer(bundled, ref);
    if (value === undefined) return bundled; // Dangling pointer -- keep everything.
    (components[group] ??= {})[name] = value;
  }

  // Security requirements name schemes directly rather than via `$ref`, so the
  // reachability walk above never sees them.
  if (document.components?.securitySchemes) {
    components.securitySchemes = document.components.securitySchemes;
  }

  const sliced: Record<string, unknown> = { ...bundled, paths };
  if (Object.keys(components).length > 0) sliced.components = components;
  else delete sliced.components;
  if (document.webhooks) sliced.webhooks = keptWebhooks;

  return sliced as T;
}

/**
 * Applies {@link sliceDocumentForPage} to fumadocs' page props, leaving any
 * other props shape (for example the preloaded variant) untouched.
 */
export function sliceApiPageProps<T extends OpenAPIPageProps>(props: T): T {
  if (!('payload' in props)) return props;

  return {
    ...props,
    payload: {
      ...props.payload,
      bundled: sliceDocumentForPage(props.payload.bundled, props.operations, props.webhooks),
    },
  } as T;
}
