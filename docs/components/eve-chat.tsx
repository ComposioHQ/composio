'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useEveAgent } from 'eve/react';
import { Send, X, Sparkles, Square } from 'lucide-react';
import { closeEveChat, useEveChatOpen } from './eve-chat-store';

const SUGGESTIONS = [
  'How do I create a session?',
  'How does authentication work?',
  'How do I use the sandbox files?',
];

/** Render assistant text with clickable Markdown links ([label](url)); everything else stays plain text. */
function renderText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const linkRe = /\[([^\]]+)\]\((\/[^)\s]+|https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = linkRe.exec(text)) !== null) {
    if (match.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    const [, label, href] = match;
    const external = href.startsWith('http');
    nodes.push(
      <a
        key={key++}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        className="text-[var(--composio-brand)] underline underline-offset-2 hover:opacity-80"
      >
        {label}
      </a>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}

/**
 * EveChat — the right-sidebar docs assistant, backed by the eve agent in
 * `agent/`. Always mounted (so the session persists) and slid off-screen when
 * closed. Each turn carries the current route as `clientContext` so Eve can
 * answer about the page you're on.
 */
export function EveChat() {
  const isOpen = useEveChatOpen();
  const pathname = usePathname();
  const agent = useEveAgent({
    prepareSend: (input) => ({ ...input, clientContext: { route: pathname } }),
  });

  const isBusy = agent.status === 'submitted' || agent.status === 'streaming';
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [agent.data.messages]);

  function submit(message: string) {
    const trimmed = message.trim();
    if (trimmed.length > 0 && !isBusy) void agent.send({ message: trimmed });
  }

  return (
    <>
      {isOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] md:hidden"
          onClick={closeEveChat}
        />
      )}
      <aside
        aria-label="Ask Eve"
        className={
          'fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-fd-border bg-fd-background shadow-xl transition-transform duration-200 ease-out md:w-[400px] ' +
          (isOpen ? 'translate-x-0' : 'translate-x-full')
        }
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-fd-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--composio-brand)]" aria-hidden="true" />
            <span className="text-sm font-medium text-fd-foreground">Ask Eve</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/40">docs assistant</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={closeEveChat}
            className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {agent.data.messages.length === 0 ? (
            <div className="flex h-full flex-col justify-center gap-3 text-center">
              <p className="text-sm text-fd-muted-foreground">
                Ask anything about the Composio docs. Eve answers from the docs and links the pages it used.
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-md border border-fd-border bg-fd-card px-3 py-2 text-left text-[13px] text-fd-foreground/80 transition-colors hover:border-[var(--composio-brand)]/40 hover:text-fd-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {agent.data.messages.map((message) => (
                <li key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
                  <div
                    className={
                      message.role === 'user'
                        ? 'max-w-[85%] rounded-lg bg-[var(--composio-brand)]/10 px-3 py-2 text-[13px] text-fd-foreground'
                        : 'max-w-full text-[13px] leading-relaxed text-fd-foreground/90'
                    }
                  >
                    {message.parts.map((part, i) =>
                      part.type === 'text' ? (
                        <p key={i} className="whitespace-pre-wrap break-words">
                          {message.role === 'assistant' ? renderText(part.text) : part.text}
                        </p>
                      ) : null,
                    )}
                  </div>
                </li>
              ))}
              {agent.status === 'submitted' && (
                <li className="text-[13px] text-fd-muted-foreground">Searching the docs…</li>
              )}
            </ul>
          )}
        </div>

        {/* composer */}
        <form
          className="border-t border-fd-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const value = inputRef.current?.value ?? '';
            submit(value);
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          <div className="flex items-end gap-2 rounded-lg border border-fd-border bg-fd-card px-3 py-2 focus-within:border-[var(--composio-brand)]/50">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Ask about the docs…"
              className="max-h-32 flex-1 resize-none bg-transparent text-[13px] text-fd-foreground outline-none placeholder:text-fd-muted-foreground"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit(event.currentTarget.value);
                  event.currentTarget.value = '';
                }
              }}
            />
            {isBusy ? (
              <button
                type="button"
                aria-label="Stop"
                onClick={() => agent.stop()}
                className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground"
              >
                <Square className="size-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Send"
                className="inline-flex size-7 items-center justify-center rounded-md bg-[var(--composio-brand)] text-white transition-opacity hover:opacity-90"
              >
                <Send className="size-3.5" />
              </button>
            )}
          </div>
          {agent.status === 'error' && (
            <p className="mt-2 text-[12px] text-red-500">Something went wrong. Try again.</p>
          )}
        </form>
      </aside>
    </>
  );
}
