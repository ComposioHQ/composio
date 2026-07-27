/**
 * Narrows an OpenAPI document to just what one API reference page renders.
 *
 * fumadocs-openapi 11 makes `<OpenAPIPage />` a client component and hands it
 * `payload.bundled` -- the *entire* document -- so Next serializes the whole
 * spec into the RSC payload of every operation page. For this repo that is
 * ~451 KB per page across ~93 pages, even though a page renders one operation.
 * (fumadocs 10 passed only a document id and resolved it server-side.)
 *
 * Keeping only the page's own operations plus the components they can reach
 * cuts that to ~8 KB on average.
 *
 * Correctness over cleverness: if the document uses an internal `$ref` that
 * points anywhere other than `#/components/...`, this bails out and returns the
 * document untouched rather than risk emitting a dangling pointer.
 */

// The document shape is spec-driven, so `any` is deliberate throughout.

export interface PageOperation {
  path: string;
  method: string;
}

export interface PageWebhook {
  name: string;
  method: string;
}

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

// Path-item keys that must travel with a kept operation.
const SHARED_PATH_ITEM_KEYS = ['parameters', 'servers', 'summary', 'description'];

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolvePointer(document: any, ref: string): unknown {
  return ref
    .slice(2)
    .split('/')
    .reduce<any>(
      (node, segment) =>
        node === null || typeof node !== 'object'
          ? undefined
          : node[decodePointerSegment(segment)],
      document
    );
}

/**
 * Collects every `#/components/...` pointer reachable from `node`, following
 * references transitively. Returns null if a non-component internal reference
 * is found, signalling the caller to keep the whole document.
 */
function collectComponentRefs(
  document: any,
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

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
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
  pathItem: any,
  methods: Set<string>
): Record<string, unknown> | undefined {
  const kept: Record<string, unknown> = {};
  let matched = false;

  for (const [key, value] of Object.entries<any>(pathItem)) {
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

export function sliceDocumentForPage(
  bundled: any,
  operations: PageOperation[] = [],
  webhooks: PageWebhook[] = []
): any {
  if (!bundled || typeof bundled !== 'object') return bundled;
  if (operations.length === 0 && webhooks.length === 0) return bundled;

  const paths: Record<string, unknown> = {};
  for (const [path, methods] of groupByKey(operations, op => op.path)) {
    const pathItem = bundled.paths?.[path];
    if (!pathItem) return bundled; // Unexpected shape -- do not risk a partial document.
    const kept = pickOperations(pathItem, methods);
    if (!kept) return bundled;
    paths[path] = kept;
  }

  const keptWebhooks: Record<string, unknown> = {};
  for (const [name, methods] of groupByKey(webhooks, hook => hook.name)) {
    const webhookItem = bundled.webhooks?.[name];
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
    const name = rest.map(decodePointerSegment).join('/');
    const value = resolvePointer(bundled, ref);
    if (value === undefined) return bundled; // Dangling pointer -- keep everything.
    (components[group] ??= {})[name] = value;
  }

  // Security requirements name schemes directly rather than via `$ref`, so the
  // reachability walk above never sees them.
  if (bundled.components?.securitySchemes) {
    components.securitySchemes = bundled.components.securitySchemes;
  }

  const sliced: Record<string, unknown> = { ...bundled, paths };
  if (Object.keys(components).length > 0) sliced.components = components;
  else delete sliced.components;
  if (bundled.webhooks) sliced.webhooks = keptWebhooks;

  return sliced;
}

/**
 * Applies {@link sliceDocumentForPage} to fumadocs' page props, leaving any
 * other props shape (for example the preloaded variant) untouched.
 */
export function sliceApiPageProps<T extends Record<string, any>>(props: T): T {
  const bundled = props?.payload?.bundled;
  if (!bundled) return props;

  return {
    ...props,
    payload: {
      ...props.payload,
      bundled: sliceDocumentForPage(bundled, props.operations, props.webhooks),
    },
  };
}
