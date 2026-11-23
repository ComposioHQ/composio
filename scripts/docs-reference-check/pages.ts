import { createProcessor } from '@mdx-js/mdx';
import type { Code, Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import { Data, Effect } from 'effect';
import { visit } from 'unist-util-visit';
import { decodeFenceOptions } from './fences';

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

const parseTree = (page: string, source: string) =>
  Effect.try({
    try: (): Root => processor.parse(source),
    catch: cause =>
      new PageParseError({
        page,
        line: lineOfCause(cause),
        message: `Cannot parse page: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const languageOf = (language: string | null | undefined) =>
  language && Object.hasOwn(LANGUAGES, language) ? LANGUAGES[language] : undefined;

// CommonMark treats an unterminated fence as a code node through the end of its
// container. Verify the closing marker from the same node's source positions.
const inspectFence = (node: Code, source: string) => {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return;
  const opening = /^(`{3,}|~{3,})[ \t]*/.exec(source.slice(start, end));
  if (!opening) return; // An indented code block has no opening marker.
  const marker = opening[1];
  const lastLine = source.lastIndexOf('\n', end - 1) + 1;
  const closing = source
    .slice(lastLine, end)
    .replace(/^(?:[ \t]*>[ \t]?)+/, '')
    .trim();
  return {
    languageOffset: start + opening[0].length,
    closed:
      lastLine > start &&
      closing.length >= marker.length &&
      closing === marker[0].repeat(closing.length),
  };
};

const invalidFence = (page: string, node: Code, message: string) =>
  new PageParseError({ page, line: node.position?.start.line ?? null, message });

export const parsePage = (page: string, source: string) =>
  Effect.gen(function* () {
    const tree = yield* parseTree(page, withoutFrontmatter(source));
    const className = pageTitle(source);
    const candidates: { node: Code; location: FenceLocation }[] = [];
    let section: string | null = null;
    let method: string | null = null;
    visit(tree, node => {
      if (node.type === 'heading' && node.depth <= 2) {
        section = node.depth === 2 ? textOf(node) : null;
        method = null;
      } else if (node.type === 'heading' && node.depth === 3) {
        method = textOf(node);
      } else if (node.type === 'code' && node.position) {
        candidates.push({
          node,
          location: { page, line: node.position.start.line, className, section, method },
        });
      }
    });

    const fences: PageFence[] = [];
    for (const { node, location } of candidates) {
      const marker = inspectFence(node, source);
      if (!marker) continue;
      const extension = languageOf(node.lang);
      if (!extension) {
        if (!node.lang || languageOf(node.lang.toLowerCase())) {
          return yield* invalidFence(page, node, 'Use a lowercase TypeScript fence language');
        }
        continue;
      }
      if (!marker.closed) return yield* invalidFence(page, node, 'Unclosed TypeScript fence');
      fences.push({ location, extension, meta: node.meta ?? null, code: node.value });
    }
    return fences;
  });

const hasFenceAtLineStart = (line: string) => {
  let cursor = 0;
  while (cursor < line.length) {
    if (' \t>-+*'.includes(line[cursor])) {
      cursor++;
      continue;
    }
    if (line.startsWith('```', cursor) || line.startsWith('~~~', cursor)) return true;

    const start = cursor;
    while (line[cursor] >= '0' && line[cursor] <= '9') cursor++;
    if (cursor === start || (line[cursor] !== '.' && line[cursor] !== ')')) return false;
    cursor++;
  }
  return false;
};

export const renderAuthoredExample = (example: string, owner: string) =>
  Effect.gen(function* () {
    const body = example.trim();
    if (!body) {
      return yield* new PageParseError({
        page: owner,
        line: null,
        message: `${owner}: empty @example`,
      });
    }
    // Bare JSDoc examples contain TypeScript expressions that need a fence before MDX parses them.
    const hasFence = body.split(/[\r\n\u2028\u2029]/).some(hasFenceAtLineStart);
    const source = hasFence ? body : ['```typescript', body, '```'].join('\n');
    const tree = yield* parseTree(owner, source);
    const blocks: Code[] = [];
    visit(tree, 'code', node => {
      blocks.push(node);
    });
    if (blocks.length === 0) {
      return yield* new PageParseError({
        page: owner,
        line: null,
        message: `${owner}: @example has no TypeScript fence`,
      });
    }
    let rendered = source;
    for (const node of blocks.reverse()) {
      const marker = inspectFence(node, source);
      if (!marker || !languageOf(node.lang)) {
        return yield* invalidFence(
          owner,
          node,
          `${owner}: use a TypeScript fence with a lowercase language`
        );
      }
      if (!marker.closed) {
        return yield* invalidFence(owner, node, `${owner}: unclosed TypeScript fence in @example`);
      }
      const mode = yield* decodeFenceOptions(node.meta).pipe(
        Effect.mapError(error => invalidFence(owner, node, `${owner}: ${error.message}`))
      );
      if (mode._tag === 'Signature') {
        return yield* invalidFence(
          owner,
          node,
          `${owner}: the "signature" option is reserved for generated signatures`
        );
      }
      if (node.lang === 'ts') {
        const offset = marker.languageOffset;
        rendered = rendered.slice(0, offset) + 'typescript' + rendered.slice(offset + 2);
      }
    }
    return rendered;
  });
