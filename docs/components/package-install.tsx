'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clipboard } from 'lucide-react';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { cn } from '@/lib/utils';

const ECOSYSTEMS = {
  node: [
    { id: 'npm', install: 'npm install' },
    { id: 'pnpm', install: 'pnpm add' },
    { id: 'bun', install: 'bun add' },
    { id: 'yarn', install: 'yarn add' },
  ],
  python: [
    { id: 'uv', install: 'uv add' },
    { id: 'pip', install: 'pip install' },
  ],
} as const;

type Ecosystem = keyof typeof ECOSYSTEMS;

/**
 * Install-command code block whose copy button is a package-manager picker.
 *
 * Renders the first manager's command by default (`npm install …` for node,
 * `uv add …` for python). The copy button opens a menu of managers; selecting
 * one rewrites the displayed command for that manager and copies it. Comment
 * lines are display-only and never copied.
 *
 * The menu is portaled to `document.body`: ancestors (fumadocs `Tabs`, the
 * `CodeBlock` figure) clip overflow, and the actions container's
 * `backdrop-blur` would make it the containing block for `position: fixed`.
 */
export function PackageInstall({
  packages,
  comment,
  ecosystem = 'node',
}: {
  /** Space-separated package names, e.g. "@composio/core @openai/agents" */
  packages: string;
  /** Display-only `#` comment line(s) shown below the command; excluded from copy */
  comment?: string | string[];
  /** Which package managers to offer; defaults to node (npm/pnpm/bun/yarn) */
  ecosystem?: Ecosystem;
}) {
  const managers = ECOSYSTEMS[ecosystem];
  const [manager, setManager] = useState<string>(managers[0].id);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRect = useRef<DOMRect | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    anchorRect.current = rect;
    // Page coordinates; the menu is right-aligned to the trigger via -translate-x-full.
    setPosition({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    // Close only when the trigger actually moved in the viewport (the menu is
    // positioned in page coordinates); ignore spurious scroll events.
    const onScrollOrResize = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const anchor = anchorRect.current;
      if (!rect || !anchor) return setOpen(false);
      if (Math.abs(rect.top - anchor.top) > 1 || Math.abs(rect.left - anchor.left) > 1) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const commandFor = (id: string) =>
    `${managers.find((m) => m.id === id)?.install ?? managers[0].install} ${packages}`;

  const select = async (id: string) => {
    setManager(id);
    setOpen(false);
    try {
      await navigator.clipboard.writeText(commandFor(id));
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (e.g. insecure context); selection still applies
    }
  };

  const comments = comment == null ? [] : Array.isArray(comment) ? comment : [comment];

  return (
    <CodeBlock
      allowCopy={false}
      Actions={({ className }) => (
        <div className={className}>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={copied ? 'Copied install command' : 'Copy install command'}
            data-checked={copied || undefined}
            className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:text-fd-accent-foreground data-checked:text-fd-accent-foreground [&_svg]:size-3.5"
            onClick={toggle}
          >
            {copied ? <Check /> : <Clipboard />}
          </button>
          {open &&
            position &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                style={{ top: position.top, left: position.left }}
                className="absolute z-50 min-w-24 -translate-x-full rounded-lg border bg-fd-popover p-1 text-sm shadow-md"
              >
                {managers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={manager === m.id}
                    className={cn(
                      'flex w-full items-center rounded-md px-3 py-1.5 text-fd-popover-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground',
                      manager === m.id && 'font-medium text-fd-primary',
                    )}
                    onClick={() => void select(m.id)}
                  >
                    {m.id}
                  </button>
                ))}
              </div>,
              document.body,
            )}
        </div>
      )}
    >
      {/* No horizontal padding here: `.line` spans already carry it via shiki.css */}
      <Pre>
        <code>
          <span className="line">{commandFor(manager)}</span>
          {comments.map((line) => (
            <span
              key={line}
              className="line"
              // Inline style: fumadocs' `.shiki code span { color: var(--shiki-light) }`
              // out-specifies Tailwind utilities, so `text-fd-muted-foreground` loses.
              style={{ color: 'var(--color-fd-muted-foreground)' }}
            >
              {`# ${line}`}
            </span>
          ))}
        </code>
      </Pre>
    </CodeBlock>
  );
}
