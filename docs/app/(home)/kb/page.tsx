import type { Metadata } from 'next';
import { KnowledgeHub } from '@/components/kb/knowledge-hub';

export const metadata: Metadata = {
  title: 'Knowledge Base',
  description: 'Search public Composio product knowledge across docs, support answers, OAuth guides, toolkits, examples, reference, and changelog.',
  alternates: { canonical: '/kb' },
};

export default function KnowledgeBasePage() {
  return <KnowledgeHub />;
}
