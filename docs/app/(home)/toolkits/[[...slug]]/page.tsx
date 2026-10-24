import { markdownAlternates } from '@/lib/markdown-alternates';
import { toolkitsSource, getOgImageUrl } from '@/lib/source';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { ToolkitDetail } from '@/components/toolkits/toolkit-detail';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
import { PageActions } from '@/components/page-actions';
import { EditOnGitHub } from '@/components/edit-on-github';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getAllToolkits, getToolkitBySlug } from '@/lib/toolkit-data';
import { resolveToolkit } from '@/lib/toolkit-resolution';
import { parseToolkitFaq } from '@/lib/toolkit-faq';
import type { Metadata } from 'next';
import type { Tool, Trigger } from '@/types/toolkit';
import type { FaqItem } from '@/components/toolkits/faq-section';
import { apiToolListSchema, apiTriggerListSchema } from '@/lib/toolkit-schema';

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;

// Snapshot misses are resolved from production on demand.
export const dynamicParams = true;

// Fetch detailed tool info from Composio API (server-side only)
// Returns null on failure, empty array if toolkit has no tools
async function fetchDetailedTools(
  toolkitSlug: string
): Promise<Tool[] | null> {
  if (!API_KEY) {
    console.warn('[Toolkits] COMPOSIO_API_KEY not set, skipping detailed tool fetch');
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE}/tools?toolkit_slug=${toolkitSlug.toUpperCase()}&toolkit_versions=latest&include_pricing=true&limit=10000`,
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

    const parsed = apiToolListSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : [];
  } catch (error) {
    console.error(`[Toolkits] Error fetching detailed tools for ${toolkitSlug}:`, error);
    return null;
  }
}

// Fetch detailed trigger info from Composio API (server-side only)
// Returns null on failure, empty array if toolkit has no triggers
async function fetchDetailedTriggers(
  toolkitSlug: string,
  version?: string | null
): Promise<Trigger[] | null> {
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

    const parsed = apiTriggerListSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : [];
  } catch (error) {
    console.error(`[Toolkits] Error fetching detailed triggers for ${toolkitSlug}:`, error);
    return null;
  }
}


async function readToolkitFaq(slug: string): Promise<FaqItem[] | null> {
  const filePath = join(process.cwd(), 'content/toolkits/faq', `${slug}.md`);
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  return parseToolkitFaq(content);
}

export async function generateStaticParams() {
  // Index page
  const indexParam = { slug: [] };

  // MDX pages
  const mdxParams = toolkitsSource.generateParams();

  // JSON toolkit pages
  const toolkits = await getAllToolkits();
  const jsonParams = toolkits.map(toolkit => ({
    slug: [toolkit.slug],
  }));

  return [indexParam, ...mdxParams, ...jsonParams];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // Index page
  if (!slug || slug.length === 0) {
    const ogImage = getOgImageUrl(
      'toolkits',
      [],
      'Toolkits',
      'Browse all toolkits supported by Composio'
    );
    return {
      title: 'Toolkits',
      description: 'Browse all toolkits supported by Composio',
      alternates: markdownAlternates('/toolkits'),
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
      alternates: markdownAlternates(page.url),
      openGraph: { images: [ogImage] },
      twitter: { card: 'summary_large_image', images: [ogImage] },
    };
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    const toolkit = await resolveToolkit(slug[0]);
    if (toolkit) {
      const title = `${toolkit.name?.trim() || toolkit.slug} - Composio Toolkit`;
      const description = `Build an AI agent that connects to ${toolkit.name?.trim() || toolkit.slug} using Composio. ${toolkit.description}`;
      const ogImage = getOgImageUrl('toolkits', slug, title, description, {
        logo: toolkit.logo,
      });
      return {
        title,
        description,
        alternates: await getToolkitBySlug(toolkit.slug)
          ? markdownAlternates(`/toolkits/${toolkit.slug}`)
          : { canonical: `/toolkits/${toolkit.slug}` },
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
        <Link
          href="/toolkits"
          className="text-sm text-fd-muted-foreground no-underline hover:text-fd-foreground hover:underline"
        >
          ← All Toolkits
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold text-fd-foreground">{page.data.title}</h1>
          <PageActions path={page.url} variant="inline" />
        </div>
        <article className="prose prose-fd mt-6 max-w-none">
          <MDXContent components={getMDXComponents()} />
        </article>
        <EditOnGitHub path={`docs/content/toolkits/${page.path}`} />
      </div>
    );
  }

  // Check JSON toolkit
  if (slug.length === 1) {
    const toolkitSlug = slug[0];
    const toolkit = await resolveToolkit(toolkitSlug);

    if (toolkit) {
      // Fetch detailed tool/trigger info and FAQ content in parallel
      const [detailedTools, detailedTriggers, faq] = await Promise.all([
        fetchDetailedTools(toolkit.slug),
        fetchDetailedTriggers(toolkit.slug, toolkit.version),
        readToolkitFaq(toolkit.slug),
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
