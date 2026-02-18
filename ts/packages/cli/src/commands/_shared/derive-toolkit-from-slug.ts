export function deriveToolkitSlugFromActionSlug(actionSlug: string): string | undefined {
  const [toolkitSlug] = actionSlug.split('_');
  if (toolkitSlug === undefined || toolkitSlug.length === 0) {
    return undefined;
  }

  return toolkitSlug.toLowerCase();
}
