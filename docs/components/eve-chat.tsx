'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useEveAgent } from 'eve/react';
import { Send, X, Sparkles, Square, SquarePen } from 'lucide-react';
import { AssistantMessage, EagerSourcePreview, ToolActivity, type EagerSource } from './eve-message';
import { closeEveChat, useEveChatOpen } from './eve-chat-store';

const SUGGESTIONS = [
  'How do I create a session?',
  'How does authentication work?',
  'How do I use the sandbox files?',
];

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
  const messages = agent.data.messages;
  const lastMessage = messages[messages.length - 1];
  const lastHasAssistantText =
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some((part) => part.type === 'text' && part.text.trim().length > 0);
  // Show the loading indicator from submit through retrieval/model synthesis,
  // until the assistant's text actually starts streaming, so it doesn't flicker off.
  const thinking = isBusy && !lastHasAssistantText;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const [eagerSources, setEagerSources] = useState<EagerSource[]>([]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [agent.data.messages]);

  function clearEagerPreview() {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setEagerSources([]);
  }

  function fetchEagerPreview(message: string) {
    clearEagerPreview();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    void fetch('/api/docs-agent/eager-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { sources?: EagerSource[] } | null) => {
        if (controller.signal.aborted) return;
        setEagerSources(Array.isArray(data?.sources) ? data.sources : []);
      })
      .catch(() => {});
  }

  function submit(message: string) {
    const trimmed = message.trim();
    if (trimmed.length > 0 && !isBusy) {
      fetchEagerPreview(trimmed);
      void agent.send({ message: trimmed });
    }
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
        aria-label="Ask AI"
        className={
          'fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-fd-border bg-fd-background shadow-xl transition-transform duration-200 ease-out md:w-[400px] ' +
          (isOpen ? 'translate-x-0' : 'translate-x-full')
        }
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-fd-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--composio-brand)]" aria-hidden="true" />
            <span className="text-sm font-medium text-fd-foreground">Ask AI</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/40">docs assistant</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="New chat"
              title="New chat"
              onClick={() => {
                if (isBusy) agent.stop();
                clearEagerPreview();
                agent.reset();
                inputRef.current?.focus();
              }}
              disabled={agent.data.messages.length === 0}
              className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <SquarePen className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={closeEveChat}
              className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {agent.data.messages.length === 0 ? (
            <div className="flex h-full flex-col justify-center gap-3 text-center">
              <p className="text-sm text-fd-muted-foreground">
                Ask about the Composio docs. It answers from the docs and links the pages it used. It&apos;s not customer support and can&apos;t act on your Composio account.
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
                    {message.parts.map((part, i) => {
                      if (part.type === 'text') {
                        return message.role === 'assistant' ? (
                          <AssistantMessage key={i} text={part.text} />
                        ) : (
                          <p key={i} className="whitespace-pre-wrap break-words">
                            {part.text}
                          </p>
                        );
                      }
                      return message.role === 'assistant' ? (
                        <ToolActivity key={i} part={part} />
                      ) : null;
                    })}
                  </div>
                </li>
              ))}
              {thinking && eagerSources.length > 0 && (
                <li>
                  <EagerSourcePreview active sources={eagerSources} />
                </li>
              )}
              {thinking && (
                <li className="flex items-center gap-2 text-[13px] text-fd-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-fd-muted-foreground/60 [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-fd-muted-foreground/60 [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-fd-muted-foreground/60" />
                  </span>
                  Thinking with the docs…
                </li>
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
            if (inputRef.current) {
              inputRef.current.value = '';
              inputRef.current.style.height = 'auto';
            }
          }}
        >
          <div className="flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card px-3 py-1.5 focus-within:border-[var(--composio-brand)]/50">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Ask about the docs…"
              className="block max-h-32 min-h-[1.5rem] flex-1 resize-none self-center overflow-y-auto bg-transparent py-0 text-[13px] leading-6 text-fd-foreground outline-none placeholder:text-fd-muted-foreground"
              onChange={(event) => {
                // Auto-grow with content, up to max-h-32 (128px), then scroll.
                const el = event.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit(event.currentTarget.value);
                  event.currentTarget.value = '';
                  event.currentTarget.style.height = 'auto';
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
