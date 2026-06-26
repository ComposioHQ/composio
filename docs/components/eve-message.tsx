'use client';

import { useState, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
import { Check, Copy, FileText, Search, Wrench } from 'lucide-react';

export type EagerSource = {
  title: string;
  url: string;
};

/**
 * Renders eager docs search preview links while the assistant is thinking.
 */
export function EagerSourcePreview({ active, sources }: { active?: boolean; sources: EagerSource[] }) {
  const router = useRouter();
  if (sources.length === 0) return null;

  const base =
    'flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 text-[11px] text-fd-muted-foreground';

  return (
    <div className={base}>
      <span className="inline-flex shrink-0 items-center gap-1 text-fd-muted-foreground">
        <Search className="size-3 text-[var(--composio-brand)]/70" aria-hidden="true" />
        <span>{active ? 'Searching docs' : 'Searched docs'}</span>
      </span>
      {sources.map((source) => {
        const href = source.url.startsWith('/') ? source.url : undefined;
        const label = source.title || source.url;
        if (!href) {
          return (
            <span key={source.url} className="truncate">
              {label}
            </span>
          );
        }

        return (
          <a
            key={source.url}
            href={href}
            title={href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              event.preventDefault();
              router.push(href);
            }}
            className="group inline-flex max-w-full items-center truncate underline-offset-2 transition-colors hover:text-fd-foreground hover:underline"
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

/**
 * Renders the agent's tool activity inline — which docs it searched and which
 * pages it read — so you can see its "thinking". Returns null for non-tool parts.
 */
export function ToolActivity({ part }: { part: unknown }) {
  const router = useRouter();
  const p = part as { type?: string; toolName?: string; input?: Record<string, unknown> };
  const type = p.type ?? '';
  const toolName = type === 'dynamic-tool' ? p.toolName : type.startsWith('tool-') ? type.slice(5) : undefined;
  if (!toolName) return null;
  const input = p.input ?? {};

  let icon = <Wrench className="size-3" aria-hidden="true" />;
  let label = `Running ${toolName}`;
  let href: string | undefined;
  if (toolName === 'search_docs') {
    icon = <Search className="size-3" aria-hidden="true" />;
    const query = typeof input.query === 'string' ? input.query : '';
    label = query ? `Searched the docs for “${query}”` : 'Searched the docs';
  } else if (toolName === 'read_doc') {
    icon = <FileText className="size-3" aria-hidden="true" />;
    const url = typeof input.url === 'string' ? input.url : '';
    label = url ? `Read ${url}` : 'Read a page';
    if (url.startsWith('/')) href = url;
  }

  const base = 'flex items-center gap-1.5 py-0.5 text-[11px] text-fd-muted-foreground';
  const inner = (
    <>
      <span className="shrink-0 text-[var(--composio-brand)]/70">{icon}</span>
      <span className="truncate group-hover:underline">{label}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        title={href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          router.push(href);
        }}
        className={`${base} group cursor-pointer underline-offset-2 transition-colors hover:text-fd-foreground`}
      >
        {inner}
      </a>
    );
  }
  return <div className={base}>{inner}</div>;
}

function isInternalHref(url: string): boolean {
  if (url.startsWith('/') || url.startsWith('#')) return true;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Link renderer for assistant Markdown. Internal docs links navigate
 * client-side with the router and keep the chat open; external links open in a
 * new tab. (Modifier-clicks fall through to the browser's default.)
 */
function MarkdownLink({ href, children, node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  const router = useRouter();
  const url = href ?? '';
  if (url && isInternalHref(url)) {
    return (
      <a
        href={url}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          router.push(url);
        }}
        {...props}
      >
        {children}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

// Prose renders through react-markdown (we control link behavior and keys);
// code blocks render through the custom <CodeBlock> below (highlight.js,
// synchronous and browser-safe).
const MD_COMPONENTS: Components = { a: MarkdownLink };
const MD_PLUGINS = [remarkGfm];

// Map our fence languages to highlight.js language ids (some, like cURL, aren't
// registered grammars and fall back to a near match or auto-detection).
const HLJS_LANG: Record<string, string> = {
  py: 'python',
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  sh: 'bash', shell: 'bash', zsh: 'bash',
  curl: 'bash', http: 'bash',
};

function hljsLangFor(lang: string): string | null {
  const key = lang.toLowerCase();
  const id = HLJS_LANG[key] ?? key;
  return hljs.getLanguage(id) ? id : null;
}

/** Renders a code block with highlight.js token markup and a copy button. */
function CodeBlock({ lang, code, className }: { lang: string; code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const id = hljsLangFor(lang);
  // Use the known grammar when we have one, else auto-detect; never throw.
  const html = id
    ? hljs.highlight(code, { language: id, ignoreIllegals: true }).value
    : hljs.highlightAuto(code).value;
  return (
    <div className={'eve-hljs group relative my-2 overflow-hidden rounded-md border border-fd-border bg-fd-muted/30 ' + (className ?? '')}>
      <button
        type="button"
        aria-label="Copy code"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded text-fd-muted-foreground opacity-0 transition-opacity hover:bg-fd-accent hover:text-fd-foreground group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="max-w-full overflow-x-auto p-3 text-[11.5px] leading-relaxed">
        <code
          className={'hljs language-' + (id ?? lang)}
          // highlight.js output is escaped token markup, not user HTML.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
}

/**
 * Renders an assistant message: Markdown via Streamdown, with consecutive
 * code blocks in different languages (e.g. Python + TypeScript) grouped into
 * tabs. Tolerates an unclosed trailing code fence while streaming.
 */

const MD_CLASS =
  'text-[13px] leading-relaxed break-words [&_a]:text-[var(--composio-brand)] [&_a]:underline [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-[11.5px] [&_pre]:leading-relaxed [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-fd-foreground/[0.07] [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.9em]';

const LANG_LABEL: Record<string, string> = {
  python: 'Python', py: 'Python',
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TypeScript',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JavaScript',
  bash: 'Bash', sh: 'Shell', shell: 'Shell', zsh: 'Shell',
  json: 'JSON', curl: 'cURL', http: 'HTTP', yaml: 'YAML',
};

function labelFor(lang: string): string {
  const key = lang.toLowerCase();
  return LANG_LABEL[key] ?? (lang ? lang[0].toUpperCase() + lang.slice(1) : 'Code');
}

/**
 * Strip the model's native citation tokens. gpt-5.x emits web-search citations
 * as `\uE200cite\uE202<ref>\uE201` (private-use delimiters). The refs (e.g.
 * `turn0search0`) don't resolve here, so drop the span — unless it embeds a real
 * URL, in which case keep it as a Markdown link. Real citations come through as
 * normal Markdown links from the agent's instructions.
 */
function cleanCitations(text: string): string {
  return text
    .replace(/\uE200[\s\S]*?\uE201/g, (span) => {
      const url = span.match(/(https?:\/\/[^\s\uE200-\uE20F]+|\/[A-Za-z0-9/_#-]+)/);
      return url ? ` ([source](${url[1]}))` : '';
    })
    .replace(/[\uE200-\uE20F]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1');
}

type Seg = { kind: 'prose'; text: string } | { kind: 'code'; lang: string; code: string };

/** Split into prose and fenced-code segments, tolerating an unclosed trailing fence. */
function parseSegments(text: string): Seg[] {
  const segs: Seg[] = [];
  const fenceRe = /```([\w-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) segs.push({ kind: 'prose', text: text.slice(last, m.index) });
    segs.push({ kind: 'code', lang: m[1] || '', code: m[2].replace(/\n+$/, '') });
    last = m.index + m[0].length;
  }
  const rest = text.slice(last);
  const open = /```([\w-]*)\n([\s\S]*)$/.exec(rest);
  if (open) {
    const before = rest.slice(0, open.index);
    if (before.trim()) segs.push({ kind: 'prose', text: before });
    segs.push({ kind: 'code', lang: open[1] || '', code: open[2] });
  } else if (rest) {
    segs.push({ kind: 'prose', text: rest });
  }
  return segs;
}

/** A prose segment that's just a short language label (e.g. "Python", "**TypeScript**"). */
function isThinLabel(text: string): boolean {
  const t = text.trim();
  if (t === '') return true;
  if (t.length > 20) return false;
  const plain = t.replace(/[*_`#>-]/g, '').trim().toLowerCase();
  return /^(python|py|typescript|ts|tsx|javascript|js|bash|shell|sh|zsh|json|curl|http|yaml)$/.test(plain);
}

type Block = { lang: string; code: string };
type Group =
  | { kind: 'prose'; text: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'tabs'; blocks: Block[] };

function group(segs: Seg[]): Group[] {
  const out: Group[] = [];
  let i = 0;
  while (i < segs.length) {
    const seg = segs[i];
    if (seg.kind === 'prose') {
      out.push(seg);
      i++;
      continue;
    }
    const blocks: Block[] = [{ lang: seg.lang, code: seg.code }];
    let j = i + 1;
    while (j < segs.length) {
      const cur = segs[j];
      const next = segs[j + 1];
      if (cur.kind === 'prose' && isThinLabel(cur.text) && next && next.kind === 'code') {
        blocks.push({ lang: next.lang, code: next.code });
        j += 2;
      } else if (cur.kind === 'code') {
        blocks.push({ lang: cur.lang, code: cur.code });
        j += 1;
      } else {
        break;
      }
    }
    const distinct = new Set(blocks.map((b) => labelFor(b.lang)));
    if (blocks.length >= 2 && distinct.size >= 2) out.push({ kind: 'tabs', blocks });
    else for (const b of blocks) out.push({ kind: 'code', lang: b.lang, code: b.code });
    i = j;
  }
  return out;
}

function CodeTabs({ blocks }: { blocks: Block[] }) {
  const [active, setActive] = useState(0);
  const items = blocks.map((b) => labelFor(b.lang));
  const current = blocks[Math.min(active, blocks.length - 1)];
  return (
    <div className="my-2 overflow-hidden rounded-md border border-fd-border">
      <div className="flex border-b border-fd-border bg-fd-muted/30">
        {items.map((label, i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            onClick={() => setActive(i)}
            className={
              'px-3 py-1.5 text-[12px] font-medium transition-colors ' +
              (i === active
                ? 'border-b-2 border-[var(--composio-brand)] text-fd-foreground'
                : 'border-b-2 border-transparent text-fd-muted-foreground hover:text-fd-foreground')
            }
          >
            {label}
          </button>
        ))}
      </div>
      <CodeBlock lang={current.lang} code={current.code} className="!my-0 rounded-none border-0" />
    </div>
  );
}

export function AssistantMessage({ text }: { text: string }) {
  const groups = group(parseSegments(cleanCitations(text)));
  return (
    <div className="flex flex-col">
      {groups.map((g, i) => {
        if (g.kind === 'tabs') return <CodeTabs key={i} blocks={g.blocks} />;
        if (g.kind === 'code') return <CodeBlock key={i} lang={g.lang} code={g.code} />;
        return (
          <div key={i} className={MD_CLASS}>
            <ReactMarkdown remarkPlugins={MD_PLUGINS} components={MD_COMPONENTS}>
              {g.text}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}
