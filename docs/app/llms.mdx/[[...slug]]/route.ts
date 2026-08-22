import {
  source,
  getReferenceSource,
  examplesSource,
  toolkitsSource,
  knowledgeBaseSource,
  changelogEntries,
  slugToDate,
  formatDate,
  getLLMText,
  mdxToCleanMarkdown,
  type LLMPage,
} from '@/lib/source';
import { dereferenceDocument } from '@/lib/openapi-deref';
import {
  REST_VERSION_GUIDANCE,
  TOOL_VERSION_GUIDANCE,
  apiVersionPointer,
  isToolVersionPath,
  toolVersionParameterDescription,
} from '@/lib/api-version-guidance';
import { notFound } from 'next/navigation';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getAllToolkits, getToolkitBySlug } from '@/lib/toolkit-data';
import { getAllMetaTools, getMetaToolBySlug } from '@/lib/meta-tools-data';
import type { MetaTool, MetaToolParameter } from '@/lib/meta-tools-data';
import type { Toolkit, Tool, Trigger, ParameterSchema } from '@/types/toolkit';
import { apiToolListSchema, apiTriggerListSchema } from '@/lib/toolkit-schema';
import { z } from 'zod';
import {
  getKnowledgeByProductArea,
  getKnowledgeByToolkit,
  getKnowledgeToolkitSummaries,
  type KnowledgeLink,
} from '@/lib/knowledge/catalog';
import { getProductArea, isProductAreaSlug, PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';

export const revalidate = false;

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;
const API_FETCH_LIMIT = 1000; // Note: Toolkits with more items will be truncated

// Fetch detailed tool info from Composio API
async function fetchDetailedTools(toolkitSlug: string): Promise<Tool[] | null> {
  if (!API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE}/tools?toolkit_slug=${toolkitSlug.toUpperCase()}&toolkit_versions=latest&limit=${API_FETCH_LIMIT}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) {
      console.warn(`[LLM Markdown] Failed to fetch tools for ${toolkitSlug}: ${response.status}`);
      return null;
    }

    const parsed = apiToolListSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn(`[LLM Markdown] Invalid API response format for toolkit ${toolkitSlug}`);
      return null;
    }

    if (parsed.data.length >= API_FETCH_LIMIT) {
      console.warn(
        `[LLM Markdown] Toolkit ${toolkitSlug} has ${parsed.data.length}+ tools, results may be truncated`
      );
    }

    return parsed.data;
  } catch {
    return null;
  }
}

// Fetch detailed trigger info from Composio API
async function fetchDetailedTriggers(toolkitSlug: string): Promise<Trigger[] | null> {
  if (!API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE}/triggers_types?toolkit_slugs=${toolkitSlug.toUpperCase()}&toolkit_versions=latest&limit=${API_FETCH_LIMIT}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) {
      console.warn(
        `[LLM Markdown] Failed to fetch triggers for ${toolkitSlug}: ${response.status}`
      );
      return null;
    }

    const parsed = apiTriggerListSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn(`[LLM Markdown] Invalid API response format for triggers ${toolkitSlug}`);
      return null;
    }

    if (parsed.data.length >= API_FETCH_LIMIT) {
      console.warn(
        `[LLM Markdown] Toolkit ${toolkitSlug} has ${parsed.data.length}+ triggers, results may be truncated`
      );
    }

    return parsed.data;
  } catch {
    return null;
  }
}

// Types for OpenAPI structures (from dereferenced document)
interface OpenAPISchema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: string[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  default?: unknown;
  example?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  additionalProperties?: OpenAPISchema | boolean;
}

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: OpenAPISchema;
  example?: unknown;
}

interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: OpenAPISchema; example?: unknown }>;
}

interface OpenAPIResponse {
  description?: string;
  content?: Record<string, { schema?: OpenAPISchema; example?: unknown }>;
}

interface OpenAPISecurityScheme {
  type: string;
  description?: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
}

interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
  tags?: string[];
}

interface OpenAPIPageData {
  title: string;
  description?: string;
  getOpenAPIPageProps: () => {
    payload: { bundled: Record<string, unknown> };
    operations?: Array<{ method: string; path: string; tags?: string[] }>;
    webhooks?: Array<{ name: string; method: string }>;
  };
}

// Fumadocs page data is untyped across the mixed sources this route serves, so
// each candidate page is parsed once against the shape its renderer needs.
const openAPIPageSchema = z.object({
  url: z.string(),
  data: z.object({
    title: z.string(),
    description: z.string().optional().catch(undefined),
    getOpenAPIPageProps: z.custom<OpenAPIPageData['getOpenAPIPageProps']>(
      value => typeof value === 'function'
    ),
  }),
});

const llmPageSchema: z.ZodType<LLMPage> = z.object({
  url: z.string(),
  data: z.object({
    title: z.string(),
    description: z.string().optional().catch(undefined),
    getText: z
      .custom<NonNullable<LLMPage['data']['getText']>>(value => typeof value === 'function')
      .optional()
      .catch(undefined),
    legacy: z.boolean().optional().catch(undefined),
    written: z.string().optional().catch(undefined),
    llmGuardrails: z.enum(['direct-execution', 'none']).optional().catch(undefined),
  }),
});

const degradedPageSchema = z.object({
  url: z.unknown().optional(),
  data: z
    .object({
      title: z.unknown().optional(),
      description: z.unknown().optional(),
    })
    .catch({}),
});

export function degradedPageToMarkdown(value: unknown): string | null {
  const parsed = degradedPageSchema.safeParse(value);
  if (!parsed.success) return null;

  const title = parsed.data.data.title || 'Documentation';
  const description = parsed.data.data.description || '';
  const url = parsed.data.url || '';
  return `# ${String(title)} (${String(url)})\n\n${String(description)}`;
}

// Generate sample value for a schema
function generateSampleValue(schema: OpenAPISchema, depth = 0): unknown {
  if (depth > 3) return '...'; // Prevent infinite recursion

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case 'string':
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      return 'string';
    case 'integer':
    case 'number':
      return schema.minimum ?? 1;
    case 'boolean':
      return true;
    case 'array':
      if (schema.items) {
        return [generateSampleValue(schema.items, depth + 1)];
      }
      return [];
    case 'object':
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          obj[key] = generateSampleValue(prop, depth + 1);
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          obj['key'] = generateSampleValue(schema.additionalProperties, depth + 1);
        }
        return obj;
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        return { key: generateSampleValue(schema.additionalProperties, depth + 1) };
      }
      return {};
    default:
      return null;
  }
}

/**
 * Renders object properties, dictionaries, and composed schemas as nested
 * Markdown list items.
 *
 * `indent` controls the emitted list indentation, while `depth` independently
 * tracks recursion because `allOf` expands without increasing indentation. An
 * ellipsis is emitted when either value exceeds `maxDepth`.
 */
function renderSchema(schema: OpenAPISchema, indent = 0, maxDepth = 4, depth = 0): string[] {
  if (indent > maxDepth || depth > maxDepth) {
    return ['  '.repeat(indent) + '- ...'];
  }

  const lines: string[] = [];
  const prefix = '  '.repeat(indent);
  const required = schema.required || [];

  if (
    schema.type === 'object' &&
    (schema.properties ||
      (schema.additionalProperties && typeof schema.additionalProperties === 'object'))
  ) {
    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        const isRequired = required.includes(name);
        const reqMark = isRequired ? ' *(required)*' : '';
        const typeStr = getTypeString(prop);
        const desc = prop.description ? `: ${prop.description}` : '';

        lines.push(`${prefix}- \`${name}\` (${typeStr})${reqMark}${desc}`);

        // Recurse for nested objects/arrays
        if (
          prop.type === 'object' &&
          (prop.properties ||
            (prop.additionalProperties && typeof prop.additionalProperties === 'object'))
        ) {
          lines.push(...renderSchema(prop, indent + 1, maxDepth, depth + 1));
        } else if (
          prop.type === 'array' &&
          prop.items?.type === 'object' &&
          (prop.items.properties ||
            (prop.items.additionalProperties &&
              typeof prop.items.additionalProperties === 'object'))
        ) {
          lines.push(`${prefix}  - Array items:`);
          lines.push(...renderSchema(prop.items, indent + 2, maxDepth, depth + 1));
        }
      }
    }

    // Render additionalProperties as [key: string]
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const ap = schema.additionalProperties;
      const typeStr = getTypeString(ap);
      const desc = ap.description ? `: ${ap.description}` : '';
      lines.push(`${prefix}- \`[key: string]\` (${typeStr})${desc}`);
      if (
        ap.type === 'object' &&
        (ap.properties || (ap.additionalProperties && typeof ap.additionalProperties === 'object'))
      ) {
        lines.push(...renderSchema(ap, indent + 1, maxDepth, depth + 1));
      } else if (
        ap.type === 'array' &&
        ap.items?.type === 'object' &&
        (ap.items.properties ||
          (ap.items.additionalProperties && typeof ap.items.additionalProperties === 'object'))
      ) {
        lines.push(`${prefix}  - Array items:`);
        lines.push(...renderSchema(ap.items, indent + 2, maxDepth, depth + 1));
      }
    }
  } else if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf || schema.anyOf || [];
    lines.push(`${prefix}*One of:*`);
    for (const variant of variants.slice(0, 3)) {
      if (variant.type === 'object' && variant.properties) {
        lines.push(...renderSchema(variant, indent + 1, maxDepth, depth + 1));
      } else {
        lines.push(`${prefix}  - ${getTypeString(variant)}`);
      }
    }
    if (variants.length > 3) {
      lines.push(`${prefix}  - ... and ${variants.length - 3} more`);
    }
  } else if (schema.allOf) {
    for (const part of schema.allOf) {
      if (part.type === 'object' && part.properties) {
        lines.push(...renderSchema(part, indent, maxDepth, depth + 1));
      }
    }
  }

  return lines;
}

/** Overrides only the top-level request-body version field for affected tool operations. */
function withToolVersionDescription(rawSpecPath: string, schema: OpenAPISchema): OpenAPISchema {
  const versionProperty = schema.properties?.version;
  if (!versionProperty || !isToolVersionPath(rawSpecPath)) return schema;

  return {
    ...schema,
    properties: {
      ...schema.properties,
      version: {
        ...versionProperty,
        description: toolVersionParameterDescription(rawSpecPath, versionProperty.description),
      },
    },
  };
}

// Get a readable type string
function getTypeString(schema: OpenAPISchema, depth = 0, maxDepth = 4): string {
  if (depth > maxDepth) return '...';

  if (schema.enum) {
    return `enum: ${schema.enum
      .slice(0, 3)
      .map(e => `"${e}"`)
      .join(' | ')}${schema.enum.length > 3 ? ' | ...' : ''}`;
  }
  if (schema.type === 'array' && schema.items) {
    return `array<${getTypeString(schema.items, depth + 1, maxDepth)}>`;
  }
  if (schema.format) {
    return `${schema.type} (${schema.format})`;
  }
  return schema.type || 'any';
}

// Generate cURL example with sample data
function generateCurl(
  method: string,
  path: string,
  baseUrl: string,
  parameters: OpenAPIParameter[] = [],
  requestBody?: OpenAPIRequestBody
): string {
  // Build path with sample values
  let url = path;
  const queryParams: string[] = [];

  for (const param of parameters) {
    const sample = param.example ?? generateSampleValue(param.schema || { type: 'string' });
    if (param.in === 'path') {
      url = url.replace(`{${param.name}}`, String(sample));
    } else if (param.in === 'query' && param.required) {
      queryParams.push(`${param.name}=${encodeURIComponent(String(sample))}`);
    }
  }

  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }

  let curl = `curl -X ${method.toUpperCase()} "${baseUrl}${url}"`;
  curl += ` \\\n  -H "x-api-key: YOUR_API_KEY"`;

  // Add request body
  if (requestBody?.content?.['application/json']) {
    curl += ` \\\n  -H "Content-Type: application/json"`;
    const schema = requestBody.content['application/json'].schema;
    const example = requestBody.content['application/json'].example;
    const body = example ?? (schema ? generateSampleValue(schema) : {});
    curl += ` \\\n  -d '${JSON.stringify(body, null, 2).split('\n').join('\n  ')}'`;
  }

  return curl;
}

// Convert OpenAPI page to comprehensive markdown
export async function openapiPageToMarkdown(page: {
  url: string;
  data: OpenAPIPageData;
}): Promise<string> {
  const { title, description } = page.data;
  const props = page.data.getOpenAPIPageProps();

  // The renderers read schema fields directly, so inline local references first.
  const spec = dereferenceDocument(props.payload.bundled);
  const paths = spec.paths as Record<string, Record<string, OpenAPIOperation>> | undefined;
  const webhooks = spec.webhooks as Record<string, Record<string, OpenAPIOperation>> | undefined;
  const securitySchemes = (spec.components as Record<string, unknown>)?.securitySchemes as
    Record<string, OpenAPISecurityScheme> | undefined;
  const servers = spec.servers as Array<{ url: string; description?: string }> | undefined;
  const baseUrl = servers?.[0]?.url || 'https://backend.composio.dev';

  const lines: string[] = [`# ${title}`, ''];
  lines.push(`**Documentation:** ${page.url}`, '');

  // Which REST version this page documents, emitted above the `**Endpoint:**`
  // line below so a truncating reader still sees it. These pages publish a
  // complete working curl example and never touch mdxToCleanMarkdown, so
  // without this the strongest v3 signal in the corpus stays unlabelled.
  const versionPointer = apiVersionPointer(page.url);
  if (versionPointer) {
    lines.push(versionPointer.trim(), '');
  }

  if (description) {
    lines.push(description, '');
  }

  const selectedOperations: Array<{
    method: string;
    name: string;
    operation: OpenAPIOperation;
    isWebhook: boolean;
  }> = [];

  for (const op of props.operations ?? []) {
    const operation = paths?.[op.path]?.[op.method.toLowerCase()];
    if (operation) {
      selectedOperations.push({
        method: op.method,
        name: op.path,
        operation,
        isWebhook: false,
      });
    }
  }

  for (const webhook of props.webhooks ?? []) {
    const operation = webhooks?.[webhook.name]?.[webhook.method.toLowerCase()];
    if (operation) {
      selectedOperations.push({
        method: webhook.method,
        name: webhook.name,
        operation,
        isWebhook: true,
      });
    }
  }

  // Process API operations and webhook deliveries through the same schema
  // renderer. Fumadocs exposes them as separate page-prop collections.
  for (const selected of selectedOperations) {
    const { method, name, operation, isWebhook } = selected;
    lines.push('---', '');
    lines.push(`## ${method.toUpperCase()} \`${name}\``, '');
    if (isWebhook) {
      lines.push(`**Event type:** \`${name}\``, '');
    } else {
      lines.push(`**Endpoint:** \`${baseUrl}${name}\``, '');
    }

    if (operation.summary) {
      lines.push(`**Summary:** ${operation.summary}`, '');
    }

    if (operation.description) {
      lines.push(operation.description, '');
    }

    // Authentication
    const security = operation.security;
    if (security && security.length > 0 && securitySchemes) {
      lines.push('### Authentication', '');
      const authMethods: string[] = [];
      for (const secReq of security) {
        for (const schemeName of Object.keys(secReq)) {
          const scheme = securitySchemes[schemeName];
          if (scheme) {
            if (scheme.type === 'apiKey') {
              authMethods.push(
                `**${schemeName}** - API Key in \`${scheme.in}\` header \`${scheme.name}\``
              );
            } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
              authMethods.push(`**${schemeName}** - Bearer token in Authorization header`);
            } else {
              authMethods.push(`**${schemeName}** - ${scheme.type}`);
            }
          }
        }
      }
      lines.push(authMethods.join(' OR '), '');
    }

    // Path Parameters
    const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
    if (pathParams.length > 0) {
      lines.push('### Path Parameters', '');
      for (const param of pathParams) {
        const typeStr = getTypeString(param.schema || { type: 'string' });
        lines.push(`- \`${param.name}\` (${typeStr}) *(required)*: ${param.description || ''}`);
      }
      lines.push('');
    }

    // Query Parameters
    const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
    if (queryParams.length > 0) {
      lines.push('### Query Parameters', '');
      for (const param of queryParams) {
        const typeStr = getTypeString(param.schema || { type: 'string' });
        const reqMark = param.required ? ' *(required)*' : '';
        const description =
          (param.name === 'version' || param.name === 'toolkit_versions') &&
          isToolVersionPath(name)
            ? toolVersionParameterDescription(name, param.description)
            : param.description || '';
        lines.push(`- \`${param.name}\` (${typeStr})${reqMark}: ${description}`);
      }
      lines.push('');
    }

    // Webhook delivery headers
    const headerParams = operation.parameters?.filter(p => p.in === 'header') || [];
    if (isWebhook && headerParams.length > 0) {
      lines.push('### Delivery Headers', '');
      for (const param of headerParams) {
        const typeStr = getTypeString(param.schema || { type: 'string' });
        const reqMark = param.required ? ' *(required)*' : '';
        lines.push(`- \`${param.name}\` (${typeStr})${reqMark}: ${param.description || ''}`);
      }
      lines.push('');
    }

    // Request Body
    if (operation.requestBody?.content?.['application/json']) {
      lines.push('### Request Body', '');
      if (operation.requestBody.description) {
        lines.push(operation.requestBody.description, '');
      }
      const schema = operation.requestBody.content['application/json'].schema;
      if (schema) {
        const renderedSchema = withToolVersionDescription(name, schema);
        lines.push('**Schema:**', '');
        lines.push(...renderSchema(renderedSchema));
        lines.push('');

        // Example
        const example =
          operation.requestBody.content['application/json'].example ?? generateSampleValue(schema);
        lines.push('**Example:**', '');
        lines.push('```json');
        lines.push(JSON.stringify(example, null, 2));
        lines.push('```', '');
      }
    }

    // Responses
    if (operation.responses) {
      lines.push('### Responses', '');

      for (const [status, response] of Object.entries(operation.responses)) {
        lines.push(`#### ${status} - ${response.description || ''}`, '');

        const jsonContent = response.content?.['application/json'];
        if (jsonContent?.schema) {
          lines.push('**Response Schema:**', '');
          lines.push(...renderSchema(jsonContent.schema));
          lines.push('');

          // Only show example for success responses
          if (status.startsWith('2')) {
            const example = jsonContent.example ?? generateSampleValue(jsonContent.schema);
            if (example && Object.keys(example as object).length > 0) {
              lines.push('**Example Response:**', '');
              lines.push('```json');
              lines.push(JSON.stringify(example, null, 2));
              lines.push('```', '');
            }
          }
        }
      }
    }

    // Webhook operations describe inbound deliveries rather than API calls.
    if (!isWebhook) {
      lines.push('### Example cURL Request', '');
      lines.push('```bash');
      lines.push(generateCurl(method, name, baseUrl, operation.parameters, operation.requestBody));
      lines.push('```', '');
    }
  }

  // Guidance goes after the operation body. Operation pages deliberately do
  // NOT receive SESSION_GUARDRAILS: that block is about SDK code generation,
  // it would be noise on a REST operation page, and — because it composes
  // TOOL_VERSION_GUIDANCE — it would force the tool-version text onto every
  // operation regardless of scope.
  //
  // The baseline applies to every operation. The tool-version note applies to
  // exactly the five endpoints whose version default changes, decided by
  // isToolVersionPath on the RAW spec path key (`/api/v3.1/tools/{tool_slug}`)
  // — normalization belongs to the predicate, so nothing is stripped here and
  // nothing keys off the page URL.
  if (selectedOperations.length > 0) {
    lines.push('---', '', REST_VERSION_GUIDANCE);
    if (selectedOperations.some(selected => isToolVersionPath(selected.name))) {
      lines.push('', TOOL_VERSION_GUIDANCE);
    }
  }

  return lines.join('\n').trim();
}

// Map URL prefixes to their sources
// Note: 'reference' is handled specially below with async getReferenceSource()
interface PageSource {
  getPage(slugs: string[] | undefined): unknown;
}

const sources: Array<{ prefix: string; source: PageSource }> = [
  { prefix: 'docs', source },
  { prefix: 'kb', source: knowledgeBaseSource },
  { prefix: 'examples', source: examplesSource },
  { prefix: 'toolkits', source: toolkitsSource },
];

/**
 * Generate a changelog index with links to all changelog entries.
 */
function generateChangelogIndex(): string {
  // Group entries by date and sort by date descending (newest first)
  const entriesByDate = new Map<string, typeof changelogEntries>();

  for (const entry of changelogEntries) {
    const existing = entriesByDate.get(entry.date) || [];
    entriesByDate.set(entry.date, [...existing, entry]);
  }

  const sortedDates = Array.from(entriesByDate.keys()).sort((a, b) => b.localeCompare(a));

  const lines: string[] = [
    '# Changelog',
    '',
    'All updates and announcements for Composio.',
    '',
    '| Date | Updates |',
    '|------|---------|',
  ];

  for (const date of sortedDates) {
    const entries = entriesByDate.get(date) || [];
    const [year, month, day] = date.split('-');
    const mdUrl = `https://docs.composio.dev/docs/changelog/${year}/${month}/${day}.md`;
    const formattedDate = formatDate(date);
    const titles = entries.map(e => e.title).join(', ');
    lines.push(`| [${formattedDate}](${mdUrl}) | ${titles} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('For the full changelog with details, visit each date above.');

  return lines.join('\n');
}

/**
 * Generate markdown for changelog entries matching a specific date.
 * Multiple entries on the same date are combined into one document.
 */
async function changelogToMarkdown(dateStr: string): Promise<string | null> {
  const matchingEntries = changelogEntries.filter(entry => entry.date === dateStr);

  if (matchingEntries.length === 0) {
    return null;
  }

  const formattedDate = formatDate(dateStr);
  const lines: string[] = [
    `# Changelog - ${formattedDate}`,
    '',
    `**Documentation:** https://docs.composio.dev/docs/changelog/${dateStr.replace(/-/g, '/')}`,
    '',
  ];

  for (const entry of matchingEntries) {
    lines.push(`## ${entry.title}`, '');

    if (entry.description) {
      lines.push(entry.description, '');
    }

    // Try to get the processed text if available
    if (typeof entry.getText === 'function') {
      try {
        const text = await entry.getText('processed');
        if (text) {
          lines.push(mdxToCleanMarkdown(text), '');
        }
      } catch {
        // getText not available, try raw
        try {
          const text = await entry.getText('raw');
          if (text) {
            lines.push(mdxToCleanMarkdown(text), '');
          }
        } catch {
          // No text available, just use title/description
        }
      }
    }

    lines.push('---', '');
  }

  return lines.join('\n').trim();
}

// Format parameter type with enum values if available
function formatParamType(param: ParameterSchema): string {
  let typeStr = param.type || 'string';
  if (param.enum && param.enum.length > 0) {
    const enumValues = param.enum.map(v => `"${v}"`).join(' | ');
    typeStr = `${typeStr} (${enumValues})`;
  }
  return typeStr;
}

// Render parameters as markdown table
function renderParamsMarkdown(params: Record<string, ParameterSchema>): string[] {
  const lines: string[] = [];
  lines.push('| Parameter | Type | Required | Description |');
  lines.push('|-----------|------|----------|-------------|');

  for (const [name, param] of Object.entries(params)) {
    const typeStr = formatParamType(param);
    const required = param.required ? 'Yes' : 'No';
    const desc = (param.description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| \`${name}\` | ${typeStr} | ${required} | ${desc} |`);
  }

  return lines;
}

// Read FAQ markdown for a toolkit (returns raw markdown or null)
async function readToolkitFaqMarkdown(slug: string): Promise<string | null> {
  try {
    const filePath = join(process.cwd(), 'content/toolkits/faq', `${slug}.md`);
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Generate markdown from toolkit with detailed tools and triggers
function toolkitToMarkdown(
  toolkit: Toolkit,
  detailedTools?: Tool[],
  detailedTriggers?: Trigger[],
  faqMarkdown?: string | null
): string {
  const tools = detailedTools || toolkit.tools;
  const triggers = detailedTriggers || toolkit.triggers;

  const lines: string[] = [
    `# ${toolkit.name.trim()}`,
    '',
    toolkit.description,
    '',
    `- **Category:** ${toolkit.category || 'Uncategorized'}`,
    `- **Auth:** ${toolkit.authSchemes.join(', ') || 'None'}`,
    `- **Composio Managed App Available?** ${
      toolkit.authSchemes?.some(s => s.toUpperCase().includes('OAUTH'))
        ? toolkit.composioManagedAuthSchemes && toolkit.composioManagedAuthSchemes.length > 0
          ? 'Yes'
          : 'No'
        : 'N/A'
    }`,
    `- **Tools:** ${toolkit.toolCount}`,
    `- **Triggers:** ${toolkit.triggerCount}`,
    `- **Slug:** \`${toolkit.slug.toUpperCase()}\``,
  ];

  if (toolkit.version) {
    lines.push(`- **Version:** ${toolkit.version}`);
  }

  if (faqMarkdown && faqMarkdown.trim()) {
    lines.push('', '## Frequently Asked Questions', '');
    // Bump ## headings to ### so FAQ questions are children of the FAQ section
    lines.push(faqMarkdown.trim().replace(/^## /gm, '### '));
  }

  if (tools.length > 0) {
    lines.push('', '## Tools', '');
    for (const tool of tools) {
      lines.push(`### ${tool.name}`, '');
      lines.push(`**Slug:** \`${tool.slug}\``, '');
      lines.push(tool.description, '');

      // Input parameters
      if (tool.input_parameters && Object.keys(tool.input_parameters).length > 0) {
        lines.push('#### Input Parameters', '');
        lines.push(...renderParamsMarkdown(tool.input_parameters));
        lines.push('');
      }

      // Output parameters
      if (tool.output_parameters && Object.keys(tool.output_parameters).length > 0) {
        lines.push('#### Output', '');
        lines.push(...renderParamsMarkdown(tool.output_parameters));
        lines.push('');
      }
    }
  }

  if (triggers.length > 0) {
    lines.push('', '## Triggers', '');
    for (const trigger of triggers) {
      lines.push(`### ${trigger.name}`, '');
      lines.push(`**Slug:** \`${trigger.slug}\``, '');

      // Trigger type (webhook/poll)
      if (trigger.type) {
        lines.push(`**Type:** ${trigger.type}`, '');
      }

      lines.push(trigger.description, '');

      // Config parameters
      if (trigger.config && Object.keys(trigger.config).length > 0) {
        lines.push('#### Configuration', '');
        lines.push(...renderParamsMarkdown(trigger.config));
        lines.push('');
      }

      // Payload parameters
      if (trigger.payload && Object.keys(trigger.payload).length > 0) {
        lines.push('#### Payload', '');
        lines.push(...renderParamsMarkdown(trigger.payload));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// Generate markdown for /toolkits/managed-auth.md
async function generateManagedAuthIndex(): Promise<string> {
  const toolkits = await getAllToolkits();

  // Only include OAuth toolkits
  const oauthToolkits = toolkits.filter(t =>
    t.authSchemes?.some(s => s.toUpperCase().includes('OAUTH'))
  );

  const managed = oauthToolkits
    .filter(t => t.composioManagedAuthSchemes && t.composioManagedAuthSchemes.length > 0)
    .sort((a, b) => (a.name?.trim() || '').localeCompare(b.name?.trim() || ''));

  const unmanaged = oauthToolkits
    .filter(t => !t.composioManagedAuthSchemes || t.composioManagedAuthSchemes.length === 0)
    .sort((a, b) => (a.name?.trim() || '').localeCompare(b.name?.trim() || ''));

  const lines: string[] = [
    '# Composio Managed Auth',
    '',
    'Toolkits with managed auth work out of the box with no OAuth setup. For toolkits without managed auth, you need to provide your own credentials.',
    '',
    'You can also check programmatically whether a toolkit has managed auth:',
    '',
    '```bash',
    "curl 'https://backend.composio.dev/api/v3/toolkits/posthog' \\",
    "  -H 'x-api-key: YOUR_API_KEY'",
    '```',
    '',
    'See [When to use your own developer credentials](/docs/authentication/custom-app-vs-managed-app.md) for help deciding which approach fits your use case.',
    '',
    `## Composio Managed App Available (${managed.length})`,
    '',
    '| Toolkit | Slug |',
    '|---------|------|',
  ];

  for (const t of managed) {
    lines.push(
      `| [${t.name?.trim() || t.slug}](/toolkits/${t.slug}.md) | \`${t.slug.toUpperCase()}\` |`
    );
  }

  lines.push('');
  lines.push(`## Requires Your Own Credentials (${unmanaged.length})`);
  lines.push('');
  lines.push('| Toolkit | Slug |');
  lines.push('|---------|------|');

  for (const t of unmanaged) {
    lines.push(
      `| [${t.name?.trim() || t.slug}](/toolkits/${t.slug}.md) | \`${t.slug.toUpperCase()}\` |`
    );
  }

  return lines.join('\n');
}

// Generate a comprehensive toolkits index for /toolkits.md
async function generateToolkitsIndex(): Promise<string> {
  const toolkits = await getAllToolkits();

  // Sort alphabetically by name
  const sorted = [...toolkits].sort((a, b) =>
    (a.name?.trim() || '').localeCompare(b.name?.trim() || '')
  );

  const lines: string[] = [
    '# Toolkits',
    '',
    `Composio supports ${toolkits.length} toolkits for building AI agents.`,
    '',
    '- [Pro Tools](/toolkits/pro-tools.md) - Which tools cost extra, how they are priced, and what the limits are',
    '- [Composio Managed Auth](/toolkits/managed-auth.md) - Full list of OAuth toolkits that work out of the box vs ones that need your own credentials',
    '',
    '## All Toolkits',
    '',
    '| Toolkit | Slug | Tools | Triggers | Auth | Managed App |',
    '|---------|------|-------|----------|------|-------------|',
  ];

  for (const toolkit of sorted) {
    const name = toolkit.name?.trim() || toolkit.slug;
    const auth = toolkit.authSchemes?.join(', ') || 'None';
    const hasOAuth = toolkit.authSchemes?.some(s => s.toUpperCase().includes('OAUTH'));
    const managedApp = hasOAuth
      ? toolkit.composioManagedAuthSchemes && toolkit.composioManagedAuthSchemes.length > 0
        ? 'Yes'
        : 'No'
      : '—';
    lines.push(
      `| [${name}](/toolkits/${toolkit.slug}.md) | \`${toolkit.slug.toUpperCase()}\` | ${toolkit.toolCount} | ${toolkit.triggerCount} | ${auth} | ${managedApp} |`
    );
  }

  lines.push('', '## Toolkit Details', '');
  lines.push(
    'For detailed information about each toolkit including all tools and triggers, visit the individual toolkit pages listed above.'
  );

  return lines.join('\n');
}

const LLM_FOOTER =
  '\n\n---\n\n📚 **More documentation:** [View all docs](https://docs.composio.dev/llms.txt) | [Glossary](https://docs.composio.dev/llms.mdx/reference/glossary) | [Examples](https://docs.composio.dev/llms.mdx/examples) | [API Reference](https://docs.composio.dev/llms.mdx/reference)';

function knowledgeLinksToMarkdown(links: KnowledgeLink[]): string {
  return links
    .map((link) => `- [${link.title}](${link.href}) — ${link.description} (${link.sourceLabel})`)
    .join('\n');
}

async function knowledgeBrowseToMarkdown(rest: string[]): Promise<string | null> {
  if (rest.length === 0) {
    const areas = PRODUCT_AREAS.filter((area) => area.defaultBrowse)
      .map((area) => `- [${area.title}](https://docs.composio.dev/kb/topic/${area.slug}) — ${area.description}`)
      .join('\n');
    return `# Composio Knowledge Base\n\nSearch and browse public Composio knowledge across docs, verified support answers, OAuth guides, toolkits, examples, reference, and changelog.\n\n- [Search support knowledge](https://docs.composio.dev/kb/search)\n- [Browse all toolkits](https://docs.composio.dev/kb/toolkits)\n\n## Support topics\n\n${areas}${LLM_FOOTER}`;
  }

  if (rest.length === 1 && rest[0] === 'search') {
    return `# Search Composio support knowledge\n\nUse the [Knowledge Base search](https://docs.composio.dev/kb/search) to find canonical public support answers and toolkit-specific fixes.${LLM_FOOTER}`;
  }

  if (rest.length === 1 && rest[0] === 'toolkits') {
    const toolkits = await getKnowledgeToolkitSummaries();
    const rows = toolkits
      .map((toolkit) => `- [${toolkit.name}](https://docs.composio.dev/kb/toolkit/${toolkit.slug}) — ${toolkit.knowledgeCount} resource${toolkit.knowledgeCount === 1 ? '' : 's'}`)
      .join('\n');
    return `# Toolkit knowledge\n\nBrowse canonical public knowledge by provider.\n\n${rows}${LLM_FOOTER}`;
  }

  if (rest.length === 2 && rest[0] === 'topic' && isProductAreaSlug(rest[1])) {
    const area = getProductArea(rest[1]);
    const links = await getKnowledgeByProductArea(rest[1]);
    if (!area.defaultBrowse && links.length === 0) return null;
    return `# ${area.title}\n\n${area.description}\n\n${knowledgeLinksToMarkdown(links)}${LLM_FOOTER}`;
  }

  if (rest.length === 2 && rest[0] === 'toolkit') {
    const toolkits = await getKnowledgeToolkitSummaries();
    const toolkit = toolkits.find((candidate) => candidate.slug === rest[1]);
    if (!toolkit) return null;
    const links = await getKnowledgeByToolkit(toolkit.slug);
    return `# ${toolkit.name} knowledge\n\nCanonical public Composio information for ${toolkit.name}.\n\n${knowledgeLinksToMarkdown(links)}${LLM_FOOTER}`;
  }

  return null;
}

// Render meta tool parameters as markdown
function renderMetaToolParams(
  properties: Record<string, MetaToolParameter>,
  requiredFields: string[] = [],
  indent = 0
): string[] {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [name, param] of Object.entries(properties)) {
    const typeStr =
      param.type === 'array' &&
      param.items &&
      typeof param.items === 'object' &&
      (param.items as Record<string, unknown>).type
        ? `array<${(param.items as Record<string, unknown>).type}>`
        : param.type;
    const reqMark = requiredFields.includes(name) ? ' *(required)*' : '';
    const desc = param.description
      ? `: ${param.description.replace(/\*\*/g, '').replace(/__/g, '').replace(/\n+/g, ' ').trim()}`
      : '';
    const defaultStr =
      param.default !== undefined && param.default !== null && param.default !== ''
        ? ` (default: \`${String(param.default)}\`)`
        : '';
    const enumStr =
      param.enum && param.enum.length > 0
        ? ` — values: ${param.enum.map(v => `\`${v}\``).join(', ')}`
        : '';

    lines.push(`${prefix}- \`${name}\` (${typeStr})${reqMark}${desc}${defaultStr}${enumStr}`);

    if (param.properties && Object.keys(param.properties).length > 0) {
      const nestedRequired = Array.isArray(param.required) ? param.required : [];
      lines.push(...renderMetaToolParams(param.properties, nestedRequired, indent + 1));
    }

    const items =
      param.items && typeof param.items === 'object'
        ? (param.items as Record<string, unknown>)
        : null;
    if (
      items?.properties &&
      typeof items.properties === 'object' &&
      Object.keys(items.properties as object).length > 0
    ) {
      const itemsRequired = Array.isArray(items.required) ? (items.required as string[]) : [];
      lines.push(`${prefix}  - Array items:`);
      lines.push(
        ...renderMetaToolParams(
          items.properties as Record<string, MetaToolParameter>,
          itemsRequired,
          indent + 2
        )
      );
    }
  }

  return lines;
}

// Generate markdown for a single meta tool
function metaToolToMarkdown(tool: MetaTool): string {
  const lines: string[] = [`# ${tool.displayName}`, '', `**Slug:** \`${tool.slug}\``];

  if (tool.tags.length > 0) {
    lines.push(`**Tags:** ${tool.tags.join(', ')}`);
  }

  lines.push('');

  const inputProps = tool.inputParameters?.properties || {};
  if (Object.keys(inputProps).length > 0) {
    lines.push('## Input Parameters', '');
    lines.push(...renderMetaToolParams(inputProps, tool.inputParameters?.required || []));
    lines.push('');
  }

  const responseProps = tool.responseSchema?.properties || {};
  if (Object.keys(responseProps).length > 0) {
    lines.push('## Response', '');
    lines.push(...renderMetaToolParams(responseProps, tool.responseSchema?.required || []));
    lines.push('');
  }

  return lines.join('\n') + LLM_FOOTER;
}

// Generate markdown index for all meta tools
function metaToolsIndexToMarkdown(tools: MetaTool[]): string {
  const lines: string[] = [
    '# Meta Tools',
    '',
    'Meta tools are system-level tools available in sessions. They handle tool discovery, execution, authentication, and sandboxing.',
    '',
    '| Tool | Tags |',
    '|------|------|',
  ];

  for (const tool of tools) {
    const tags = tool.tags.length > 0 ? tool.tags.join(', ') : '—';
    lines.push(
      `| [\`${tool.slug}\`](/toolkits/meta-tools/${tool.slug.toLowerCase().replace('composio_', '')}.md) | ${tags} |`
    );
  }

  return lines.join('\n') + LLM_FOOTER;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  try {
    const { slug = [] } = await params;
    const [prefix, ...rest] = slug;

    if (prefix === 'kb') {
      const browseMarkdown = await knowledgeBrowseToMarkdown(rest);
      if (browseMarkdown) {
        return new Response(browseMarkdown, {
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        });
      }
    }

    // Special handling for toolkits index - generate comprehensive list
    if (prefix === 'toolkits' && rest.length === 0) {
      const toolkitsIndex = await generateToolkitsIndex();
      return new Response(toolkitsIndex, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
        },
      });
    }

    // Special handling for managed auth page - generate server-side list
    if (prefix === 'toolkits' && rest.length === 1 && rest[0] === 'managed-auth') {
      const managedAuthIndex = await generateManagedAuthIndex();
      return new Response(managedAuthIndex, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
        },
      });
    }

    // Special handling for changelog index - /docs/changelog
    if (prefix === 'docs' && rest[0] === 'changelog' && rest.length === 1) {
      const changelogIndex = generateChangelogIndex();
      return new Response(changelogIndex, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
        },
      });
    }

    // Special handling for changelog pages - /docs/changelog/YYYY/MM/DD
    if (prefix === 'docs' && rest[0] === 'changelog' && rest.length === 4) {
      // rest = ['changelog', '2026', '01', '07']
      const [, year, month, day] = rest;
      const dateStr = slugToDate([year, month, day]);

      if (dateStr) {
        const markdown = await changelogToMarkdown(dateStr);
        if (markdown) {
          return new Response(markdown, {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          });
        }
      }
      // If no entries found, fall through to notFound
      notFound();
    }

    // Special handling for meta tools - /toolkits/meta-tools and /toolkits/meta-tools/{slug}.
    // Must run before the generic toolkits page resolution and the JSON toolkit block
    // below, since the meta-tool MDX is just a <MetaToolDetailServer /> shell that can't
    // render to useful markdown — the content is generated from the JSON data instead.
    if (prefix === 'toolkits' && rest[0] === 'meta-tools') {
      if (rest.length === 1) {
        // Index page
        const tools = await getAllMetaTools();
        return new Response(metaToolsIndexToMarkdown(tools), {
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        });
      }
      if (rest.length === 2) {
        // Individual tool page — match by page slug (e.g., "search_tools" or "search_tools.md")
        const pageSlug = rest[1].replace(/\.md$/, '');
        const tools = await getAllMetaTools();
        const tool = tools.find(t => t.slug.toLowerCase().replace('composio_', '') === pageSlug);
        if (tool) {
          return new Response(metaToolToMarkdown(tool), {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          });
        }
      }
    }

    // Handle 'reference' specially - uses async getReferenceSource() for OpenAPI pages
    let pageSource: PageSource;
    if (prefix === 'reference') {
      try {
        pageSource = await getReferenceSource();
      } catch (e) {
        console.error('Error loading reference source:', e);
        // Fall back to MDX-only reference source if OpenAPI loading fails
        const { referenceSource } = await import('@/lib/source');
        pageSource = referenceSource;
      }
    } else {
      const match = sources.find(s => s.prefix === prefix);
      if (!match) notFound();
      pageSource = match.source;
    }

    // Get the page from that source (MDX pages)
    let page;
    try {
      page = pageSource.getPage(rest.length > 0 ? rest : undefined);
    } catch (e) {
      console.error('Error in getPage:', e);
      page = null;
    }

    if (page) {
      // Check if this is an OpenAPI page
      const openapiPage = openAPIPageSchema.safeParse(page);
      if (openapiPage.success) {
        try {
          const markdown = await openapiPageToMarkdown(openapiPage.data);
          return new Response(markdown, {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          });
        } catch (e) {
          console.error('Error generating OpenAPI markdown:', e);
          const title = openapiPage.data.data.title || 'API Reference';
          const description = openapiPage.data.data.description || '';
          return new Response(`# ${title}\n\n${description}`, {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          });
        }
      }

      // Regular MDX page
      const llmPage = llmPageSchema.safeParse(page);
      if (llmPage.success) {
        try {
          return new Response(await getLLMText(llmPage.data), {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          });
        } catch (e) {
          console.error('Error generating LLM text:', e);
          const title = llmPage.data.data.title || 'Documentation';
          const description = llmPage.data.data.description || '';
          return new Response(`# ${title} (${llmPage.data.url})\n\n${description}`, {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          });
        }
      }

      const degradedMarkdown = degradedPageToMarkdown(page);
      if (degradedMarkdown !== null) {
        return new Response(degradedMarkdown, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
          },
        });
      }
    }

    // Special handling for JSON toolkit pages
    if (prefix === 'toolkits' && rest.length === 1) {
      const toolkit = await getToolkitBySlug(rest[0]);
      if (toolkit) {
        // Fetch detailed tool/trigger info and FAQ content in parallel
        const [detailedTools, detailedTriggers, faqMarkdown] = await Promise.all([
          fetchDetailedTools(rest[0]),
          fetchDetailedTriggers(rest[0]),
          readToolkitFaqMarkdown(rest[0]),
        ]);

        return new Response(
          toolkitToMarkdown(
            toolkit,
            detailedTools !== null ? detailedTools : undefined,
            detailedTriggers !== null ? detailedTriggers : undefined,
            faqMarkdown
          ),
          {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          }
        );
      }
    }

    notFound();
  } catch (e) {
    // Don't catch notFound - let it propagate
    if (e && typeof e === 'object' && 'digest' in e) {
      throw e;
    }
    console.error('Unexpected error in llms.mdx route:', e);
    return new Response(`# Error\n\nAn error occurred while generating the markdown content.`, {
      status: 500,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    });
  }
}
