'use client';

import { useState } from 'react';

/* ── Token types ── */
// k=keyword, s=string, f=function, v=variable, p=named-param, _=punctuation
type T = 'k' | 's' | 'f' | 'v' | 'p' | '_';
type Tok = [string, T];

// github-light / github-dark to match the site's Shiki themes
const CLR: Record<T, string> = {
  k: 'text-[#cf222e] dark:text-[#ff7b72]',
  s: 'text-[#0a3069] dark:text-[#a5d6ff]',
  f: 'text-[#8250df] dark:text-[#d2a8ff]',
  v: 'text-[#1f2328] dark:text-[#e6edf3]',
  p: 'text-[#953800] dark:text-[#ffa657]',
  _: 'text-[#636c76] dark:text-[#7d8590]',
};

/* ── Snippets ── */
const LANGS = ['Python', 'TypeScript'] as const;
type Lang = (typeof LANGS)[number];

const CODE: Record<Lang, { tokens: Tok[][]; raw: string }> = {
  Python: {
    tokens: [
      [['composio', 'v'], [' = ', '_'], ['Composio', 'f'], ['()', '_']],
      [
        ['session', 'v'], [' = ', '_'], ['composio', 'v'], ['.', '_'],
        ['create', 'f'], ['(', '_'], ['user_id', 'p'], ['=', '_'],
        ['"user_123"', 's'], [')', '_'],
      ],
      [['tools', 'v'], [' = ', '_'], ['session', 'v'], ['.', '_'], ['tools', 'f'], ['()', '_']],
    ],
    raw: 'composio = Composio()\nsession = composio.create(user_id="user_123")\ntools = session.tools()',
  },
  TypeScript: {
    tokens: [
      [['const ', 'k'], ['composio', 'v'], [' = ', '_'], ['new ', 'k'], ['Composio', 'f'], ['();', '_']],
      [
        ['const ', 'k'], ['session', 'v'], [' = ', '_'], ['await ', 'k'],
        ['composio', 'v'], ['.', '_'], ['create', 'f'], ['(', '_'],
        ['"user_123"', 's'], [');', '_'],
      ],
      [['const ', 'k'], ['tools', 'v'], [' = ', '_'], ['await ', 'k'], ['session', 'v'], ['.', '_'], ['tools', 'f'], ['();', '_']],
    ],
    raw: 'const composio = new Composio();\nconst session = await composio.create("user_123");\nconst tools = await session.tools();',
  },
};

/* ── Component ── */
export function HeroCode() {
  const [lang, setLang] = useState<Lang>('Python');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE[lang].raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const snippet = CODE[lang];

  return (
    <div className="not-prose relative my-8 sm:my-10">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-[var(--composio-orange)]/[0.06] blur-3xl" />

      {/* Gradient border */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-[var(--composio-orange)]/40 via-[var(--composio-orange)]/10 to-fd-border p-px">
        <div className="rounded-xl bg-fd-card">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <span className="text-[13px] font-medium tracking-tight text-fd-muted-foreground">
              One session. All toolkits.
            </span>
            <button
              onClick={handleCopy}
              className="rounded-md p-1.5 text-fd-muted-foreground/50 transition-colors hover:text-fd-muted-foreground"
              aria-label="Copy code"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {copied ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Language tabs */}
          <div className="flex border-y border-fd-border px-4 sm:px-5">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={[
                  'relative px-3 py-2 text-xs font-medium transition-colors',
                  lang === l
                    ? 'text-[var(--composio-orange)]'
                    : 'text-fd-muted-foreground/50 hover:text-fd-muted-foreground',
                ].join(' ')}
              >
                {l}
                {lang === l && (
                  <span className="absolute inset-x-0 bottom-0 h-px bg-[var(--composio-orange)]" />
                )}
              </button>
            ))}
          </div>

          {/* Code */}
          <div className="px-4 sm:px-5">
            <pre
              className="overflow-x-auto py-4 text-[13px] leading-7 sm:text-sm sm:leading-7"
              style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace' }}
            >
              <code>
                {snippet.tokens.map((line, i) => (
                  <div key={`${lang}-${i}`}>
                    {line.map(([text, type], j) => (
                      <span key={j} className={CLR[type]}>
                        {text}
                      </span>
                    ))}
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
