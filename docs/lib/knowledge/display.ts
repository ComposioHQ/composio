const GENERIC_SUPPORT_DESCRIPTION = /^Public support knowledge for (.+)\.$/;

export function getKnowledgeDisplayDescription(description: string): string {
  const match = description.match(GENERIC_SUPPORT_DESCRIPTION);
  if (!match) return description;

  return `Setup and troubleshooting guidance for ${match[1]} in Composio.`;
}
