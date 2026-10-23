import { createProcessor } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { toString } from 'mdast-util-to-string';
import type { Root, RootContent } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx';

export type ExampleNode = Root | RootContent;
type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;
const markdownProcessor = createProcessor({ format: 'md', remarkPlugins: [remarkGfm] });
const mdxProcessor = createProcessor({ format: 'mdx', remarkPlugins: [remarkGfm] });

/** Frontmatter is metadata, not MDX; blanking it preserves source positions. */
export function parseExampleDocument(source: string, path: string): Root {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, (frontmatter) =>
    frontmatter.replace(/[^\n]/g, ' '),
  );
  return (path.endsWith('.md') ? markdownProcessor : mdxProcessor).parse(body);
}

/** Read literal JSX values from the parsed expression, never rendered source text. */
export function attributeValue(node: JsxElement, name: string): string | string[] | undefined {
  const attribute = node.attributes.find((item) => item.type === 'mdxJsxAttribute' && item.name === name);
  if (!attribute || attribute.type !== 'mdxJsxAttribute') return undefined;
  if (typeof attribute.value === 'string') return attribute.value;
  const statement = attribute.value?.data?.estree?.body[0];
  if (statement?.type !== 'ExpressionStatement') return undefined;
  const expression = statement.expression;
  if (expression.type === 'Literal' && typeof expression.value === 'string') return expression.value;
  if (expression.type !== 'ArrayExpression') return undefined;
  const items: string[] = [];
  for (const item of expression.elements) {
    if (item?.type !== 'Literal' || typeof item.value !== 'string') return undefined;
    items.push(item.value);
  }
  return items;
}

export type MarkdownLanguageGroup = {
  start: number;
  end: number;
  line: number;
  tabs: { value: string; source: string; line: number }[];
};

const isEndLanguages = (node: RootContent | undefined) =>
  node?.type === 'html' && /^<!--\s*end-languages\s*-->$/.test(node.value.trim());

/**
 * Plain Markdown uses consecutive Python / TypeScript / API headings. The last
 * option runs to the next heading unless `<!-- end-languages -->` closes the
 * group first; the marker belongs to neither the options nor the shared prose.
 */
export function markdownLanguageGroups(source: string): MarkdownLanguageGroup[] {
  const nodes = parseExampleDocument(source, 'example.md').children;
  const groups: MarkdownLanguageGroup[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const first = nodes[index];
    if (first.type !== 'heading' || toString(first) !== 'Python') continue;
    const group: MarkdownLanguageGroup = {
      start: first.position?.start.offset ?? 0,
      end: source.length,
      line: first.position?.start.line ?? 1,
      tabs: [],
    };
    let cursor = index;
    while (cursor < nodes.length) {
      const heading = nodes[cursor];
      if (heading.type !== 'heading' || heading.depth !== first.depth ||
        !['Python', 'TypeScript', 'API'].includes(toString(heading))) break;
      let end = cursor + 1;
      while (end < nodes.length) {
        const next = nodes[end];
        if (next.type === 'heading' && next.depth <= first.depth) break;
        if (isEndLanguages(next)) break;
        end++;
      }
      const contentStart = heading.position?.end.offset ?? 0;
      const contentEnd = nodes[end]?.position?.start.offset ?? source.length;
      group.tabs.push({ value: toString(heading), source: source.slice(contentStart, contentEnd), line: heading.position?.start.line ?? 1 });
      group.end = contentEnd;
      cursor = end;
      if (isEndLanguages(nodes[end])) {
        group.end = nodes[end].position?.end.offset ?? contentEnd;
        cursor = end + 1;
        break;
      }
    }
    groups.push(group);
    index = cursor - 1;
  }
  return groups;
}

/**
 * Converts real tab delimiters and link cards independently; nested labels and
 * fenced literals survive. Cards are delimited by the parser, not by regexes
 * that could run from one card's `title` to a later card's `description`.
 */
export function componentsToMarkdown(source: string): string {
  if (!/<(?:Tabs|Tab|TabsContent|Card)\b/.test(source)) return source;
  const changes: { start: number; end: number; text: string }[] = [];
  const visit = (node: ExampleNode) => {
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined && ['Tabs', 'Tab', 'TabsContent', 'TabsList', 'TabsTrigger'].includes(node.name ?? '')) {
        const value = attributeValue(node, 'value');
        const label = (node.name === 'Tab' || node.name === 'TabsContent') && typeof value === 'string' ? `\n**${value}:**\n` : '';
        if (!node.children.length || node.name === 'TabsList' || node.name === 'TabsTrigger') {
          changes.push({ start, end, text: label });
          return;
        }
        changes.push({ start, end: node.children[0].position?.start.offset ?? start, text: label });
        changes.push({ start: node.children.at(-1)?.position?.end.offset ?? end, end, text: '\n' });
      } else if (start !== undefined && end !== undefined && node.name === 'Card') {
        const title = attributeValue(node, 'title');
        const href = attributeValue(node, 'href');
        const description = attributeValue(node, 'description');
        if (typeof title === 'string' && typeof href === 'string') {
          const link = `- [${title}](${href})`;
          if (!node.children.length) {
            changes.push({ start, end, text: typeof description === 'string' ? `${link}: ${description}` : link });
            return;
          }
          changes.push({ start, end: node.children[0].position?.start.offset ?? start, text: `${link}: ` });
          changes.push({ start: node.children.at(-1)?.position?.end.offset ?? end, end, text: '' });
        }
      }
    }
    if ('children' in node) for (const child of node.children) visit(child);
  };
  visit(parseExampleDocument(source, 'page.mdx'));
  let result = source;
  for (const change of changes.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, change.start) + change.text + result.slice(change.end);
  }
  return result;
}
