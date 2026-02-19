import {
  source,
  getReferenceSource,
  cookbooksSource,
  toolkitsSource,
  changelogEntries,
  slugToDate,
  formatDate,
  getLLMText,
  mdxToCleanMarkdown,
} from '@/lib/source';
import { openapi } from '@/lib/openapi';
import { notFound } from 'next/navigation';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getAllToolkits, getToolkitBySlug } from '@/lib/toolkit-data';
import type { Toolkit, Tool, Trigger, ParameterSchema } from '@/types/toolkit';
import { processSchema, toolFromApi } from '@/lib/toolkit-schema';

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

    const data = await response.json();
    if (!data || typeof data !== 'object') {
      console.warn(`[LLM Markdown] Invalid API response format for toolkit ${toolkitSlug}`);
      return null;
    }

    const rawItems = data.items || data;
    const items = Array.isArray(rawItems) ? rawItems : [];

    if (items.length >= API_FETCH_LIMIT) {
      console.warn(`[LLM Markdown] Toolkit ${toolkitSlug} has ${items.length}+ tools, results may be truncated`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.filter((tool: any) => tool && typeof tool === 'object').map(toolFromApi);
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
      console.warn(`[LLM Markdown] Failed to fetch triggers for ${toolkitSlug}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data || typeof data !== 'object') {
      console.warn(`[LLM Markdown] Invalid API response format for triggers ${toolkitSlug}`);
      return null;
    }

    const rawItems = data.items || data;
    const items = Array.isArray(rawItems) ? rawItems : [];

    if (items.length >= API_FETCH_LIMIT) {
      console.warn(`[LLM Markdown] Toolkit ${toolkitSlug} has ${items.length}+ triggers, results may be truncated`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.filter((trigger: any) => trigger && typeof trigger === 'object').map((trigger: any) => ({
      slug: trigger.slug || '',
      name: trigger.name || trigger.display_name || trigger.slug || '',
      description: trigger.description || '',
      type: trigger.type,
      config: processSchema(trigger.config),
      payload: processSchema(trigger.payload),
      instructions: trigger.instructions,
    }));
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
  getAPIPageProps: () => {
    document: string;
    operations?: Array<{ method: string; path: string; tags?: string[] }>;
    webhooks?: Array<{ name: string; method: string }>;
  };
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
        return obj;
      }
      return {};
    default:
      return null;
  }
}

// Render schema as markdown with proper nesting
function renderSchema(schema: OpenAPISchema, indent = 0, maxDepth = 4): string[] {
  if (indent > maxDepth) return ['  '.repeat(indent) + '- ...'];

  const lines: string[] = [];
  const prefix = '  '.repeat(indent);
  const required = schema.required || [];

  if (schema.type === 'object' && schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      const isRequired = required.includes(name);
      const reqMark = isRequired ? ' *(required)*' : '';
      const typeStr = getTypeString(prop);
      const desc = prop.description ? `: ${prop.description}` : '';

      lines.push(`${prefix}- \`${name}\` (${typeStr})${reqMark}${desc}`);

      // Recurse for nested objects/arrays
      if (prop.type === 'object' && prop.properties) {
        lines.push(...renderSchema(prop, indent + 1, maxDepth));
      } else if (prop.type === 'array' && prop.items?.type === 'object' && prop.items.properties) {
        lines.push(`${prefix}  - Array items:`);
        lines.push(...renderSchema(prop.items, indent + 2, maxDepth));
      }
    }
  } else if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf || schema.anyOf || [];
    lines.push(`${prefix}*One of:*`);
    for (const variant of variants.slice(0, 3)) {
      if (variant.type === 'object' && variant.properties) {
        lines.push(...renderSchema(variant, indent + 1, maxDepth));
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
        lines.push(...renderSchema(part, indent, maxDepth));
      }
    }
  }

  return lines;
}

// Get a readable type string
function getTypeString(schema: OpenAPISchema): string {
  if (schema.enum) {
    return `enum: ${schema.enum.slice(0, 3).map(e => `"${e}"`).join(' | ')}${schema.enum.length > 3 ? ' | ...' : ''}`;
  }
  if (schema.type === 'array' && schema.items) {
    return `array<${getTypeString(schema.items)}>`;
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
async function openapiPageToMarkdown(
  page: { url: string; data: OpenAPIPageData }
): Promise<string> {
  const { title, description } = page.data;
  const props = page.data.getAPIPageProps();

  // Get fully dereferenced document from fumadocs-openapi
  const processed = await openapi.getSchema(props.document);
  const spec = processed.dereferenced;
  const paths = spec.paths as Record<string, Record<string, OpenAPIOperation>> | undefined;
  const securitySchemes = (spec.components as Record<string, unknown>)?.securitySchemes as Record<string, OpenAPISecurityScheme> | undefined;
  const servers = spec.servers as Array<{ url: string; description?: string }> | undefined;
  const baseUrl = servers?.[0]?.url || 'https://backend.composio.dev';

  const lines: string[] = [`# ${title}`, ''];
  lines.push(`**Documentation:** ${page.url}`, '');

  if (description) {
    lines.push(description, '');
  }

  // Process operations
  if (props.operations && paths) {
    for (const op of props.operations) {
      const pathData = paths[op.path];
      if (!pathData) continue;

      const operation = pathData[op.method];
      if (!operation) continue;

      lines.push('---', '');
      lines.push(`## ${op.method.toUpperCase()} \`${op.path}\``, '');
      lines.push(`**Endpoint:** \`${baseUrl}${op.path}\``, '');

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
                authMethods.push(`**${schemeName}** - API Key in \`${scheme.in}\` header \`${scheme.name}\``);
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
          lines.push('**Schema:**', '');
          lines.push(...renderSchema(schema));
          lines.push('');

          // Example
          const example = operation.requestBody.content['application/json'].example ?? generateSampleValue(schema);
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

      // cURL Example
      lines.push('### Example cURL Request', '');
      lines.push('```bash');
      lines.push(generateCurl(op.method, op.path, baseUrl, operation.parameters, operation.requestBody));
      lines.push('```', '');
    }
  }

  return lines.join('\n').trim();
}

// Map URL prefixes to their sources
// Note: 'reference' is handled specially below with async getReferenceSource()
const sources = [
  { prefix: 'docs', source },
  { prefix: 'cookbooks', source: cookbooksSource },
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
  const matchingEntries = changelogEntries.filter(
    (entry) => entry.date === dateStr
  );

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
function toolkitToMarkdown(toolkit: Toolkit, detailedTools?: Tool[], detailedTriggers?: Trigger[], faqMarkdown?: string | null): string {
  const tools = detailedTools || toolkit.tools;
  const triggers = detailedTriggers || toolkit.triggers;

  const lines: string[] = [
    `# ${toolkit.name.trim()}`,
    '',
    toolkit.description,
    '',
    `- **Category:** ${toolkit.category || 'Uncategorized'}`,
    `- **Auth:** ${toolkit.authSchemes.join(', ') || 'None'}`,
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
    '## All Toolkits',
    '',
    '| Toolkit | Slug | Tools | Triggers | Auth |',
    '|---------|------|-------|----------|------|',
  ];

  for (const toolkit of sorted) {
    const name = toolkit.name?.trim() || toolkit.slug;
    const auth = toolkit.authSchemes?.join(', ') || 'None';
    lines.push(
      `| [${name}](/toolkits/${toolkit.slug}.md) | \`${toolkit.slug.toUpperCase()}\` | ${toolkit.toolCount} | ${toolkit.triggerCount} | ${auth} |`
    );
  }

  lines.push('', '## Toolkit Details', '');
  lines.push('For detailed information about each toolkit including all tools and triggers, visit the individual toolkit pages listed above.');

  return lines.join('\n');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  try {
    const { slug = [] } = await params;
    const [prefix, ...rest] = slug;

    // Special handling for toolkits index - generate comprehensive list
    if (prefix === 'toolkits' && rest.length === 0) {
      const toolkitsIndex = await generateToolkitsIndex();
      return new Response(toolkitsIndex, {
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

    // Handle 'reference' specially - uses async getReferenceSource() for OpenAPI pages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pageSource: any;
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
      const match = sources.find((s) => s.prefix === prefix);
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
      if ('getAPIPageProps' in page.data) {
        try {
          const markdown = await openapiPageToMarkdown(
            page as unknown as { url: string; data: OpenAPIPageData }
          );
          return new Response(markdown, {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          });
        } catch (e) {
          console.error('Error generating OpenAPI markdown:', e);
          const title = page.data?.title || 'API Reference';
          const description = page.data?.description || '';
          return new Response(
            `# ${title}\n\n${description}`,
            {
              headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
              },
            }
          );
        }
      }

      // Regular MDX page
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response(await getLLMText(page as any), {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
          },
        });
      } catch (e) {
        console.error('Error generating LLM text:', e);
        const title = page.data?.title || 'Documentation';
        const description = page.data?.description || '';
        return new Response(
          `# ${title} (${page.url || ''})\n\n${description}`,
          {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
            },
          }
        );
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
    return new Response(
      `# Error\n\nAn error occurred while generating the markdown content.`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
        },
      }
    );
  }
}
