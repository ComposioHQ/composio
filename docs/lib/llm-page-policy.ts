interface LlmCorpusPage {
  url: string;
  data: {
    legacy?: boolean;
    sidebar?: boolean;
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

/**
 * Pages hidden for human progressive disclosure still belong in the compact
 * LLM index. Legacy pages remain excluded from the default corpus.
 */
export function collectSidebarHiddenLlmUrls(
  pages: readonly LlmCorpusPage[]
): string[] {
  return pages
    .filter(page => page.data.sidebar === false && page.data.legacy !== true)
    .map(page => page.url)
    .sort();
}
