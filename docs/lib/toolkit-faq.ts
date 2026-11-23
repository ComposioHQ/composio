import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { toHtml } from 'hast-util-to-html';
import { markdownLanguageGroups, parseExampleDocument } from './example-document';
import { toString } from 'mdast-util-to-string';

export type FaqAnswerPart =
  | { type: 'html'; html: string }
  | { type: 'languages'; groupId: 'language' | 'python-mode'; tabs: { value: string; parts: FaqAnswerPart[] }[] };

export type FaqItem = { question: string; answer: FaqAnswerPart[] };

function markdownToHtml(markdown: string): string {
  const processor = unified().use(remarkParse).use(remarkRehype);
  return toHtml(processor.runSync(processor.parse(markdown)));
}

function parseAnswer(body: string): FaqAnswerPart[] {
  const parts: FaqAnswerPart[] = [];
  let offset = 0;
  for (const group of markdownLanguageGroups(body)) {
    const before = body.slice(offset, group.start);
    if (before.trim()) parts.push({ type: 'html', html: markdownToHtml(before) });
    parts.push({
      type: 'languages',
      groupId: group.groupId,
      tabs: group.tabs.map((tab) => ({ value: tab.value, parts: parseAnswer(tab.source) })),
    });
    offset = group.end;
  }
  const after = body.slice(offset);
  if (after.trim()) parts.push({ type: 'html', html: markdownToHtml(after) });
  return parts;
}

/** Language and Python mode headings become persistent options in HTML. */
export function parseToolkitFaq(source: string): FaqItem[] {
  const headings = parseExampleDocument(source, 'faq.md').children.filter((node) => node.type === 'heading' && node.depth === 2);
  return headings.map((heading, index) => {
    const body = source.slice(heading.position?.end.offset ?? 0, headings[index + 1]?.position?.start.offset ?? source.length);
    return { question: toString(heading), answer: parseAnswer(body) };
  });
}
