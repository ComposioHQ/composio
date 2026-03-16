import { getMetaToolBySlug } from '@/lib/meta-tools-data';
import { MetaToolDetail } from './meta-tool-detail';

export async function MetaToolDetailServer({ slug }: { slug: string }) {
  const tool = await getMetaToolBySlug(slug);
  if (!tool) return <p>Meta tool not found: {slug}</p>;
  return <MetaToolDetail tool={tool} />;
}
