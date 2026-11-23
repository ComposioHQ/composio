import { createProcessor } from '@mdx-js/mdx';
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import { Data, Effect } from 'effect';
import { visit } from 'unist-util-visit';

export interface FenceLocation {
  readonly page: string;
  readonly line: number;
  readonly className: string | null;
  readonly section: string | null;
  readonly method: string | null;
}

export interface PageFence {
  readonly location: FenceLocation;
  readonly extension: 'ts' | 'tsx';
  readonly meta: string | null;
  readonly code: string;
}

export class PageParseError extends Data.TaggedError('PageParseError')<{
  readonly page: string;
  readonly line: number | null;
  readonly message: string;
}> {}

const LANGUAGES: Readonly<Record<string, 'ts' | 'tsx'>> = {
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
};

// Mirrors the processor in docs/lib/example-document.ts so fences split exactly as the
// docs site renders them; that module is not imported because its other dependencies
// are installed only under docs/.
const processor = createProcessor({ format: 'mdx', remarkPlugins: [remarkGfm] });

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Frontmatter is metadata, not MDX; blanking it keeps every source position. */
const withoutFrontmatter = (source: string) =>
  source.replace(FRONTMATTER, frontmatter => frontmatter.replace(/[^\n]/g, ' '));

const pageTitle = (source: string) => {
  const title = FRONTMATTER.exec(source)?.[1]?.match(/^title:\s*(.+?)\s*$/m)?.[1];
  if (title === undefined) return null;
  return title.replace(/^(['"])(.*)\1$/, '$2');
};

const textOf = (node: Nodes): string =>
  'value' in node ? node.value : 'children' in node ? node.children.map(textOf).join('') : '';

/** The parser names the offending position in its message, for example `(7:1-7:22)`. */
const lineOfCause = (cause: unknown) => {
  const line = /\((\d+):\d+/.exec(cause instanceof Error ? cause.message : '')?.[1];
  return line === undefined ? null : Number(line);
};

export const parsePage = (page: string, source: string) =>
  Effect.gen(function* () {
    const tree: Root = yield* Effect.try({
      try: () => processor.parse(withoutFrontmatter(source)),
      catch: cause =>
        new PageParseError({
          page,
          line: lineOfCause(cause),
          message: `Cannot parse page: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const className = pageTitle(source);
    const fences: PageFence[] = [];
    let section: string | null = null;
    let method: string | null = null;
    visit(tree, node => {
      if (node.type === 'heading' && node.depth <= 2) {
        section = node.depth === 2 ? textOf(node) : null;
        method = null;
      } else if (node.type === 'heading' && node.depth === 3) {
        method = textOf(node);
      } else if (node.type === 'code' && node.lang && node.position) {
        const extension = LANGUAGES[node.lang];
        if (extension === undefined) return;
        fences.push({
          location: { page, line: node.position.start.line, className, section, method },
          extension,
          meta: node.meta ?? null,
          code: node.value,
        });
      }
    });
    return fences;
  });
