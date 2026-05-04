import { toolkitsSource, getOgImageUrl } from '@/lib/source';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { ToolkitDetail } from '@/components/toolkits/toolkit-detail';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
import { PageActions } from '@/components/page-actions';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getAllToolkits, getToolkitBySlug } from '@/lib/toolkit-data';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { toHtml } from 'hast-util-to-html';
import type { Metadata } from 'next';
import type { Tool, Trigger } from '@/types/toolkit';
import type { FaqItem } from '@/components/toolkits/faq-section';
import { processSchema, toolFromApi } from '@/lib/toolkit-schema';

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;

// Fetch detailed tool info from Composio API (server-side only)
// Returns null on failure, empty array if toolkit has no tools
async function fetchDetailedTools(toolkitSlug: string, version?: string | null): Promise<Tool[] | null> {
  if (!API_KEY) {
    console.warn('[Toolkits] COMPOSIO_API_KEY not set, skipping detailed tool fetch');
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE}/tools?toolkit_slug=${toolkitSlug.toUpperCase()}&toolkit_versions=latest&limit=10000${version ? `&version=${encodeURIComponent(version)}` : ''}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) {
      console.warn(`[Toolkits] Failed to fetch tools for ${toolkitSlug}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rawItems = data.items || data;
    const items = Array.isArray(rawItems) ? rawItems : [];

    return items.filter((tool: any) => tool && typeof tool === 'object').map(toolFromApi);
  } catch (error) {
    console.error(`[Toolkits] Error fetching detailed tools for ${toolkitSlug}:`, error);
    return null;
  }
}

// Fetch detailed trigger info from Composio API (server-side only)
// Returns null on failure, empty array if toolkit has no triggers
async function fetchDetailedTriggers(toolkitSlug: string, version?: string | null): Promise<Trigger[] | null> {
  if (!API_KEY) {
    console.warn('[Toolkits] COMPOSIO_API_KEY not set, skipping detailed trigger fetch');
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE}/triggers_types?toolkit_slugs=${toolkitSlug.toUpperCase()}&toolkit_versions=latest&limit=10000${version ? `&version=${encodeURIComponent(version)}` : ''}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        next: { revalidate: 3600 }, // Cache for 1 hour
      }
    );

    if (!response.ok) {
      console.warn(`[Toolkits] Failed to fetch triggers for ${toolkitSlug}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rawItems = data.items || data;
    const items = Array.isArray(rawItems) ? rawItems : [];

    return items.filter((trigger: any) => trigger && typeof trigger === 'object').map((trigger: any) => {
      return {
        slug: trigger.slug || '',
        name: trigger.name || trigger.display_name || trigger.slug || '',
        description: trigger.description || '',
        type: trigger.type || undefined,
        config: processSchema(trigger.config),
        payload: processSchema(trigger.payload),
        instructions: trigger.instructions || undefined,
      };
    });
  } catch (error) {
    console.error(`[Toolkits] Error fetching detailed triggers for ${toolkitSlug}:`, error);
    return null;
  }
}

function markdownToHtml(md: string): string {
  const tree = unified().use(remarkParse).parse(md);
  const hast = unified().use(remarkRehype).runSync(tree);
  return toHtml(hast);
}

async function readToolkitFaq(slug: string): Promise<FaqItem[] | null> {
  const filePath = join(process.cwd(), 'content/toolkits/faq', `${slug}.md`);
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  const items: FaqItem[] = [];
  const sections = content.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const newlineIdx = section.indexOf('\n');
    if (newlineIdx === -1) continue;
    const question = section.slice(0, newlineIdx).trim();
    const answerMd = section.slice(newlineIdx + 1).trim();
    if (question && answerMd) {
      items.push({ question, answer: markdownToHtml(answerMd) });
    }
  }
  return items.length > 0 ? items : null;
}

export async function generateStaticParams() {
  // Index page
  const indexParam = { slug: [] };

  // MDX pages
  const mdxParams = toolkitsSource.generateParams();

  // JSON toolkit pages
  const toolkits = await getAllToolkits();
  const jsonParams = toolkits.map((toolkit) => ({
    slug: [toolkit.slug],
  }));

  return [indexParam, ...mdxParams, ...jsonParams];
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;

  // Index page
  if (!slug || slug.length === 0) {
    const ogImage = getOgImageUrl('toolkits', [], 'Toolkits', 'Browse all toolkits supported by Composio');
    return {
      title: 'Toolkits',
      description: 'Browse all toolkits supported by Composio',
      alternates: { canonical: '/toolkits' },
      openGraph: { images: [ogImage] },
      twitter: { card: 'summary_large_image', images: [ogImage] },
    };
  }

  // Check MDX first
  const page = toolkitsSource.getPage(slug);
  if (page) {
    const ogImage = getOgImageUrl('toolkits', slug, page.data.title, page.data.description);
    return {
      title: page.data.title,
      description: page.data.description,
      alternates: { canonical: page.url },
      openGraph: { images: [ogImage] },
      twitter: { card: 'summary_large_image', images: [ogImage] },
    };
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    const toolkit = await getToolkitBySlug(slug[0]);
    if (toolkit) {
      const title = `${toolkit.name?.trim() || toolkit.slug} - Composio Toolkit`;
      const description = `Build an AI agent that connects to ${toolkit.name?.trim() || toolkit.slug} using Composio. ${toolkit.description}`;
      const ogImage = getOgImageUrl('toolkits', slug, title, description);
      return {
        title,
        description,
        alternates: { canonical: `/toolkits/${toolkit.slug}` },
        openGraph: { images: [ogImage] },
        twitter: { card: 'summary_large_image', images: [ogImage] },
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
      <div>
        <a href="/toolkits" className="text-sm text-fd-muted-foreground no-underline hover:text-fd-foreground hover:underline">← All Toolkits</a>
        <h1 className="mt-2 text-3xl font-bold text-fd-foreground">{page.data.title}</h1>
        <PageActions path={page.url} />
        <article className="prose prose-fd max-w-none">
          <MDXContent components={getMDXComponents()} />
        </article>
      </div>
    );
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    const toolkitSlug = slug[0];
    const toolkit = await getToolkitBySlug(toolkitSlug);

    if (toolkit) {
      // Fetch detailed tool/trigger info and FAQ content in parallel
      const [detailedTools, detailedTriggers, faq] = await Promise.all([
        fetchDetailedTools(toolkitSlug, toolkit.version),
        fetchDetailedTriggers(toolkitSlug, toolkit.version),
        readToolkitFaq(toolkitSlug),
      ]);

      // Use detailed data if fetch succeeded, otherwise fall back to static data
      const tools = detailedTools !== null ? detailedTools : toolkit.tools;
      const triggers = detailedTriggers !== null ? detailedTriggers : toolkit.triggers;

      return (
        <ToolkitDetail
          toolkit={toolkit}
          tools={tools}
          triggers={triggers}
          path={`/toolkits/${toolkit.slug}`}
          faq={faq}
        />
      );
    }
  }

  notFound();
}
