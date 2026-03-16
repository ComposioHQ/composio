'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

function detectLang(pre: Element, code: Element | null): string {
  for (const el of [pre, code]) {
    const lang = el?.getAttribute('data-language') ?? el?.getAttribute('data-lang');
    if (lang) return lang;
  }
  const cls = Array.from(code?.classList ?? []).find(c => c.startsWith('language-'));
  if (cls) return cls.replace('language-', '');
  const text = code?.textContent ?? '';
  if (/^(pip|npm|npx|bun|yarn|pnpm) /.test(text.trim())) return 'bash';
  if (text.includes('from dotenv') || text.includes('import asyncio')) return 'python';
  if (text.includes('from "') || text.includes('from "@')) return 'typescript';
  if (text.includes('COMPOSIO_API_KEY=')) return 'bash';
  return '';
}

function getTabLabel(pre: Element, step: Element): string {
  let el: Element | null = pre.parentElement;
  while (el && el !== step) {
    if (el.getAttribute('role') === 'tabpanel') {
      const tablist = el.parentElement?.querySelector('[role="tablist"]');
      if (tablist) {
        const tabs = tablist.querySelectorAll('[role="tab"]');
        const panels = el.parentElement?.querySelectorAll(':scope > [role="tabpanel"]');
        if (panels) {
          const idx = Array.from(panels).indexOf(el);
          if (idx >= 0 && tabs[idx]) return tabs[idx].textContent?.trim() ?? '';
        }
      }
      return '';
    }
    el = el.parentElement;
  }
  return '';
}

function extractSteps(stepsEl: Element): string {
  const parts: string[] = [];
  const steps = stepsEl.querySelectorAll('.fd-step');

  steps.forEach((step) => {
    const title = step.querySelector('h3, h4, h2, [class*="step-title"], [class*="StepTitle"]');
    const titleText = title?.textContent?.trim();
    if (titleText) parts.push(`### ${titleText}`);

    const pres = step.querySelectorAll('pre');
    pres.forEach((pre) => {
      const codeEl = pre.querySelector('code');
      const code = codeEl?.textContent?.trim() ?? '';
      if (!code) return;

      const lang = detectLang(pre, codeEl);
      const tabLabel = getTabLabel(pre, step);

      if (tabLabel) {
        parts.push(`**${tabLabel}**\n\n\`\`\`${lang}\n${code}\n\`\`\``);
      } else {
        parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
      }
    });
  });

  return parts.join('\n\n');
}

interface PromptBannerProps {
  children: ReactNode;
}

export function PromptBanner({ children }: PromptBannerProps) {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { clearTimeout(timerRef.current); }, []);

  const handleCopy = async () => {
    const fullMeta = contentRef.current?.innerText ?? '';

    const splitMarker = 'Key concepts';
    const splitIdx = fullMeta.indexOf(splitMarker);
    const context = splitIdx > 0 ? fullMeta.slice(0, splitIdx).trim() : fullMeta;
    const rules = splitIdx > 0 ? fullMeta.slice(splitIdx).trim() : '';

    let sibling = contentRef.current?.closest('.not-prose')?.nextElementSibling;
    let stepsText = '';
    while (sibling) {
      if (sibling.classList.contains('fd-steps')) {
        stepsText = extractSteps(sibling);
        break;
      }
      sibling = sibling.nextElementSibling;
    }

    const parts = [context];
    if (stepsText) parts.push(`## Code\n\n${stepsText}`);
    if (rules) parts.push(rules);
    const fullPrompt = parts.join('\n\n');

    try {
      await navigator.clipboard.writeText(fullPrompt);
      clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed (e.g. permission denied) — don't show success
    }
  };

  return (
    <div className="not-prose mb-6">
      <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border border-fd-border bg-fd-card px-5 py-4 sm:flex-nowrap sm:gap-6">
        {/* Shader gradient blobs */}
        <div
          className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(242,139,60,0.15) 0%, rgba(242,139,60,0) 70%)' }}
        />
        <div
          className="pointer-events-none absolute right-20 -bottom-24 h-48 w-48 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(242,139,60,0.1) 0%, rgba(242,139,60,0) 70%)' }}
        />
        <div
          className="pointer-events-none absolute left-72 -top-20 h-44 w-44 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0) 70%)' }}
        />

        {/* Sparkle */}
        <svg className="relative shrink-0" aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 2L16.1 11.9L26 14L16.1 16.1L14 26L11.9 16.1L2 14L11.9 11.9L14 2Z" fill="var(--composio-orange)" opacity="0.25"/>
        </svg>

        <p className="relative flex-1 text-[15px] text-fd-foreground/70">
          Use skills or copy prompt to get started faster!
        </p>

        <div className="relative flex shrink-0 items-center gap-3">
          <a
            href="https://skills.sh/composiohq/skills/composio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--composio-orange)]/30 bg-transparent px-4 py-2 text-sm font-medium text-[var(--composio-orange)] transition-all hover:border-[var(--composio-orange)]/60 hover:bg-[var(--composio-orange)]/5"
          >
            Skills
            <span aria-hidden="true">↗</span>
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98] ${copied ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-transparent bg-[var(--composio-orange)] text-white shadow-sm hover:brightness-110'}`}
          >
            {copied ? (
              <Check className="h-4 w-4" strokeWidth={3} />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? 'Copied!' : 'Copy prompt'}
          </button>
        </div>
      </div>
      {/* Hidden prompt content for copy button */}
      <div ref={contentRef} className="sr-only">{children}</div>
    </div>
  );
}
