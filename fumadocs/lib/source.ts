import { docs, changelog } from 'fumadocs-mdx:collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const changelogEntries = changelog;

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `/og/docs/${segments.join('/')}`,
  };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title}

${processed}`;
}

export function formatDate(dateStr: string): string {
  // Add T12:00 to avoid UTC midnight timezone shift
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function dateToChangelogUrl(dateStr: string): string {
  // Convert "2025-12-29" to "/docs/changelog/2025/12/29"
  const [year, month, day] = dateStr.split('-');
  return `/docs/changelog/${year}/${month}/${day}`;
}

export function dateToSlug(dateStr: string): string[] {
  // Convert "2025-12-29" to ["2025", "12", "29"]
  const [year, month, day] = dateStr.split('-');
  return [year, month, day];
}

export function slugToDate(slug: string[]): string | null {
  // Convert ["2025", "12", "29"] to "2025-12-29"
  if (slug.length !== 3) return null;
  const [year, month, day] = slug;
  return `${year}-${month}-${day}`;
}
