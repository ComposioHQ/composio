import {
  source,
  referenceSource,
  examplesSource,
  toolkitsSource,
  getLLMText,
} from '@/lib/source';
import { openapi } from '@/lib/openapi';
import { notFound } from 'next/navigation';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Toolkit } from '@/types/toolkit';

export const revalidate = false;

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
const sources = [
  { prefix: 'docs', source },
  { prefix: 'reference', source: referenceSource },
  { prefix: 'examples', source: examplesSource },
  { prefix: 'toolkits', source: toolkitsSource },
];

// Generate markdown from toolkit JSON data
function toolkitToMarkdown(toolkit: Toolkit): string {
  const lines: string[] = [
    `# ${toolkit.name.trim()}`,
    '',
    toolkit.description,
    '',
    `- **Category:** ${toolkit.category || 'Uncategorized'}`,
    `- **Auth:** ${toolkit.authSchemes.join(', ') || 'None'}`,
    `- **Tools:** ${toolkit.toolCount}`,
    `- **Triggers:** ${toolkit.triggerCount}`,
  ];

  if (toolkit.tools.length > 0) {
    lines.push('', '## Tools', '');
    for (const tool of toolkit.tools) {
      lines.push(`### ${tool.name}`, '', tool.description, '');
    }
  }

  if (toolkit.triggers.length > 0) {
    lines.push('', '## Triggers', '');
    for (const trigger of toolkit.triggers) {
      lines.push(`### ${trigger.name}`, '', trigger.description, '');
    }
  }

  return lines.join('\n');
}

async function getToolkit(slug: string): Promise<Toolkit | null> {
  try {
    const filePath = join(process.cwd(), 'public/data/toolkits.json');
    const data = await readFile(filePath, 'utf-8');
    const toolkits = JSON.parse(data) as Toolkit[];
    return toolkits.find((t) => t.slug === slug) || null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  try {
    const { slug = [] } = await params;
    const [prefix, ...rest] = slug;

    // Find the matching source
    const match = sources.find((s) => s.prefix === prefix);
    if (!match) notFound();

    // Get the page from that source (MDX pages)
    let page;
    try {
      page = match.source.getPage(rest.length > 0 ? rest : undefined);
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
      const toolkit = await getToolkit(rest[0]);
      if (toolkit) {
        return new Response(toolkitToMarkdown(toolkit), {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
          },
        });
      }
    }

    notFound();
  } catch (e) {
    // Don't catch notFound - let it propagate
    if (e && typeof e === 'object' && 'digest' in e) {
      throw e;
    }
    console.error('Unexpected error in llms.mdx route:', e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : '';
    return new Response(
      `# Error\n\nAn error occurred while generating the markdown content.\n\n**Error:** ${errorMessage}\n\n**Stack:**\n\`\`\`\n${errorStack}\n\`\`\``,
      {
        status: 200, // Return 200 so we can see the error
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
        },
      }
    );
  }
}
