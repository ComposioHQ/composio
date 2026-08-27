const EXCLUDED_PUBLIC_TOOLKIT_SLUGS = new Set(['test_app']);

export function normalizeToolkitSlug(slug: string): string {
  return slug.toLowerCase();
}

export function isPublicToolkitSlug(slug: string): boolean {
  return !EXCLUDED_PUBLIC_TOOLKIT_SLUGS.has(normalizeToolkitSlug(slug));
}
