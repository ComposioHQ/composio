'use client';

import { useState } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';

// Streamdown core doesn't highlight code; the @streamdown/code plugin does.
// Match the docs' Shiki themes.
const codePlugin = createCodePlugin({ themes: ['github-light', 'github-dark'] });

// Highlight code, keep the copy button, drop the download button.
const STREAMDOWN_PROPS = {
  code: codePlugin,
  controls: { code: { copy: true, download: false } },
} as const;

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

function fence(lang: string, code: string): string {
  return '```' + (lang || '') + '\n' + code + '\n```';
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
      <Streamdown {...STREAMDOWN_PROPS} className={MD_CLASS + ' [&_pre]:!my-0 [&>div]:!my-0'}>
        {fence(current.lang, current.code)}
      </Streamdown>
    </div>
  );
}

export function AssistantMessage({ text }: { text: string }) {
  const groups = group(parseSegments(text));
  return (
    <div className="flex flex-col">
      {groups.map((g, i) => {
        if (g.kind === 'tabs') return <CodeTabs key={i} blocks={g.blocks} />;
        const md = g.kind === 'code' ? fence(g.lang, g.code) : g.text;
        return (
          <Streamdown key={i} {...STREAMDOWN_PROPS} className={MD_CLASS}>
            {md}
          </Streamdown>
        );
      })}
    </div>
  );
}
