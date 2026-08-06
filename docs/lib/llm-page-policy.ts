interface LlmCorpusPage {
  url: string;
  data: {
    legacy?: boolean;
  };
}

/**
 * Pages in the default LLM corpus are controlled by frontmatter, never by
 * visible navigation labels. Removing `legacy: true` opts a page back in.
 */
export function collectDefaultLlmExcludedUrls(
  pages: readonly LlmCorpusPage[]
): Set<string> {
  return new Set(pages.filter(page => page.data.legacy === true).map(page => page.url));
}
