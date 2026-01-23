import { toolkitsSource } from '@/lib/source';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { ToolkitDetail } from '@/components/toolkits/toolkit-detail';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
import { PageActions } from '@/components/page-actions';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Metadata } from 'next';
import type { Toolkit, Tool } from '@/types/toolkit';

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;

// Fetch detailed tool info from Composio API (server-side only)
// Returns null on failure, empty array if toolkit has no tools
async function fetchDetailedTools(toolkitSlug: string): Promise<Tool[] | null> {
  if (!API_KEY) {
    console.warn('[Toolkits] COMPOSIO_API_KEY not set, skipping detailed tool fetch');
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE}/tools?toolkit_slug=${toolkitSlug.toUpperCase()}&limit=1000`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        next: { revalidate: 3600 }, // Cache for 1 hour
      }
    );

    if (!response.ok) {
      console.warn(`[Toolkits] Failed to fetch tools for ${toolkitSlug}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rawItems = data.items || data;
    const items = Array.isArray(rawItems) ? rawItems : [];

    return items.filter((tool: any) => tool && typeof tool === 'object').map((tool: any) => {
      // Extract parameters from JSON Schema format
      const inputSchema = tool.input_parameters || tool.parameters;
      const outputSchema = tool.output_parameters || tool.response;

      // Get properties and required array from JSON Schema
      const inputProps = inputSchema?.properties || inputSchema;
      const inputRequired = inputSchema?.required || [];
      const outputProps = outputSchema?.properties || outputSchema;
      const outputRequired = outputSchema?.required || [];

      // Add required flag to each property based on the required array
      const processParams = (props: any, requiredList: string[]) => {
        if (!props || typeof props !== 'object') return undefined;
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(props)) {
          if (typeof value === 'object' && value !== null) {
            result[key] = {
              ...(value as object),
              required: requiredList.includes(key),
            };
          }
        }
        return Object.keys(result).length > 0 ? result : undefined;
      };

      return {
        slug: tool.slug || '',
        name: tool.name || tool.display_name || tool.slug || '',
        description: tool.description || '',
        input_parameters: processParams(inputProps, inputRequired),
        output_parameters: processParams(outputProps, outputRequired),
        scopes: tool.scopes || undefined,
        tags: tool.tags || undefined,
        is_deprecated: tool.is_deprecated || false,
      };
    });
  } catch (error) {
    console.error(`[Toolkits] Error fetching detailed tools for ${toolkitSlug}:`, error);
    return null;
  }
}

async function getToolkits(): Promise<Toolkit[]> {
  const filePath = join(process.cwd(), 'public/data/toolkits.json');

  try {
    const data = await readFile(filePath, 'utf-8');
    const toolkits = JSON.parse(data) as Toolkit[];

    if (!Array.isArray(toolkits)) {
      throw new Error('toolkits.json must contain an array');
    }

    if (toolkits.length === 0) {
      console.warn('[Toolkits] Warning: toolkits.json is empty');
    }

    return toolkits;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new Error(`Toolkits data file not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in toolkits.json: ${error.message}`);
    }
    throw error;
  }
}

export async function generateStaticParams() {
  // Index page
  const indexParam = { slug: [] };

  // MDX pages
  const mdxParams = toolkitsSource.generateParams();

  // JSON toolkit pages
  const toolkits = await getToolkits();
  const jsonParams = toolkits.map((toolkit) => ({
    slug: [toolkit.slug],
  }));

  return [indexParam, ...mdxParams, ...jsonParams];
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;

  // Index page
  if (!slug || slug.length === 0) {
    return {
      title: 'Toolkits',
      description: 'Browse all toolkits supported by Composio',
    };
  }

  // Check MDX first
  const page = toolkitsSource.getPage(slug);
  if (page) {
    return {
      title: page.data.title,
      description: page.data.description,
    };
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    const toolkits = await getToolkits();
    const toolkit = toolkits.find((t) => t.slug === slug[0]);
    if (toolkit) {
      return {
        title: `${toolkit.name?.trim() || toolkit.slug} - Composio Toolkit`,
        description: toolkit.description,
      };
    }
  }

  return { title: 'Toolkit Not Found' };
}

export default async function ToolkitsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;

  // Index page - show landing with search/filter
  if (!slug || slug.length === 0) {
    return <ToolkitsLanding />;
  }

  // Check MDX first
  const page = toolkitsSource.getPage(slug);
  if (page) {
    const MDXContent = page.data.body;
    return (
      <article className="prose prose-fd max-w-none">
        <PageActions path={page.url} />
        <MDXContent components={getMDXComponents()} />
      </article>
    );
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    const toolkitSlug = slug[0];
    const toolkits = await getToolkits();
    const toolkit = toolkits.find((t) => t.slug === toolkitSlug);

    if (toolkit) {
      // Fetch detailed tool info from API (includes input/output params)
      const detailedTools = await fetchDetailedTools(toolkitSlug);

      // Use detailed tools if fetch succeeded, otherwise fall back to static data
      const tools = detailedTools !== null ? detailedTools : toolkit.tools;

      return (
        <ToolkitDetail
          toolkit={toolkit}
          tools={tools}
          triggers={toolkit.triggers}
          path={`/toolkits/${toolkit.slug}`}
        />
      );
    }
  }

  notFound();
}
