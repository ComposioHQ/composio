import { KNOWLEDGE_SOURCE_LABELS, type KnowledgeSourceType } from '@/lib/knowledge/types';

const SOURCE_STYLES: Record<KnowledgeSourceType, string> = {
  docs: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  kb: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'oauth-guide': 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  toolkit: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  example: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  reference: 'border-fd-border bg-fd-muted text-fd-muted-foreground',
  changelog: 'border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  legacy: 'border-fd-border bg-fd-muted text-fd-muted-foreground',
};

export function SourceBadge({ sourceType }: { sourceType: KnowledgeSourceType }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLES[sourceType]}`}>
      {KNOWLEDGE_SOURCE_LABELS[sourceType]}
    </span>
  );
}
