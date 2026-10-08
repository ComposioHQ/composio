import type { ToolkitKnowledgeSummary } from './catalog';

type ToolkitKnowledgeRoute = Pick<ToolkitKnowledgeSummary, 'slug' | 'knowledgeCount'>;

export function getToolkitKnowledgeRedirect(
  toolkit: ToolkitKnowledgeRoute,
): string | null {
  return toolkit.knowledgeCount === 1 ? `/toolkits/${toolkit.slug}` : null;
}

export function getToolkitKnowledgeHref(toolkit: ToolkitKnowledgeRoute): string {
  return getToolkitKnowledgeRedirect(toolkit) ?? `/kb/toolkit/${toolkit.slug}`;
}

export function getToolkitKnowledgeMarkdownHref(
  toolkit: ToolkitKnowledgeRoute,
): string {
  return `${getToolkitKnowledgeHref(toolkit)}.md`;
}
