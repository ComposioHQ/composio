import { notFound, permanentRedirect } from 'next/navigation';
import { getKbLegacySegments, resolveKbAlias } from '@/lib/kb/repository';

interface LegacyKnowledgeBasePageProps {
  params: Promise<{ legacy: string[] }>;
}

export default async function LegacyKnowledgeBasePage({ params }: LegacyKnowledgeBasePageProps) {
  const { legacy } = await params;
  const requestedPath = `/kb/${legacy.join('/')}`;
  const canonical = resolveKbAlias(requestedPath);
  if (canonical && canonical !== requestedPath) permanentRedirect(canonical);
  notFound();
}

export function generateStaticParams() {
  return getKbLegacySegments().map((legacy) => ({ legacy }));
}
