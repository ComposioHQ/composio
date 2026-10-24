import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { toHtml } from 'hast-util-to-html';
import { markdownLanguageGroups, parseExampleDocument } from './example-document';
import { toString } from 'mdast-util-to-string';

export type FaqAnswerPart =
  | { type: 'html'; html: string }
  | { type: 'languages'; tabs: { value: string; html: string }[] };

export type FaqItem = { question: string; answer: FaqAnswerPart[] };

function markdownToHtml(markdown: string): string {
  const processor = unified().use(remarkParse).use(remarkRehype);
  return toHtml(processor.runSync(processor.parse(markdown)));
}

/** Language headings stay readable to agents and become persistent options in the FAQ. */
export function parseToolkitFaq(source: string): FaqItem[] {
  const headings = parseExampleDocument(source, 'faq.md').children.filter((node) => node.type === 'heading' && node.depth === 2);
  return headings.map((heading, index) => {
    const body = source.slice(heading.position?.end.offset ?? 0, headings[index + 1]?.position?.start.offset ?? source.length);
    const answer: FaqAnswerPart[] = [];
    let offset = 0;
    for (const group of markdownLanguageGroups(body)) {
      const before = body.slice(offset, group.start);
      if (before.trim()) answer.push({ type: 'html', html: markdownToHtml(before) });
      answer.push({ type: 'languages', tabs: group.tabs.map((tab) => ({ value: tab.value, html: markdownToHtml(tab.source) })) });
      offset = group.end;
    }
    const after = body.slice(offset);
    if (after.trim()) answer.push({ type: 'html', html: markdownToHtml(after) });
    return { question: toString(heading), answer };
  });
}
