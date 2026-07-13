export function resolveCopyLinkUrl(href: string, currentUrl: string): string {
  return new URL(href, currentUrl).href;
}
