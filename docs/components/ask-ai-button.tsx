'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import { useSearchContext } from '@fumadocs/ui/contexts/search';
import { useI18n } from '@fumadocs/ui/contexts/i18n';

import { toggleEveChat } from './eve-chat-store';

export function detectMac(): boolean {
  try {
    if ('userAgentData' in navigator) {
      const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
      if (platform) {
        return platform === 'macOS';
      }
    }
    return /mac/i.test(navigator.platform);
  } catch {
    return true; // default to Mac
  }
}

function useIsMac() {
  return useSyncExternalStore(
    () => () => {},
    detectMac,
    () => true,
  );
}

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
    e.preventDefault();
    toggleEveChat();
  }
};

function useAskAIShortcut() {
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}

/** Desktop: search bar + Ask AI button side by side */
export function SearchAndAskAI() {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  const { text } = useI18n();
  useAskAIShortcut();
  const isMac = useIsMac();

  return (
    <>
      {enabled && (
        <button
          type="button"
          data-search-full=""
          className="inline-flex items-center gap-2 rounded-none border bg-fd-secondary/50 p-1.5 ps-2.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground w-full max-w-[240px]"
          onClick={() => setOpenSearch(true)}
        >
          <Search className="size-4" />
          {text.search}
          <div className="ms-auto inline-flex gap-0.5">
            {hotKey.map((k, i) => (
              <kbd key={i} className="rounded-md border bg-fd-background px-1.5">
                {k.display}
              </kbd>
            ))}
          </div>
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          toggleEveChat();
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--composio-orange)]/20 bg-[var(--composio-orange)]/5 p-1.5 ps-2.5 text-sm text-[var(--composio-orange)] transition-colors hover:bg-[var(--composio-orange)]/10 shrink-0"
      >
        Ask AI
        <div className="hidden lg:inline-flex gap-0.5">
          <kbd className="rounded-md border bg-fd-background px-1.5">{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd className="rounded-md border bg-fd-background px-1.5">I</kbd>
        </div>
      </button>
    </>
  );
}

/** Mobile: search icon + Ask AI icon, shown below lg breakpoint */
export function SearchAndAskAIMobile() {
  const { enabled, setOpenSearch } = useSearchContext();

  return (
    <>
      {enabled && (
        <button
          type="button"
          data-search=""
          aria-label="Open Search"
          className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors duration-100 hover:bg-fd-accent hover:text-fd-accent-foreground"
          onClick={() => setOpenSearch(true)}
        >
          <Search className="size-4.5" />
        </button>
      )}
      <button
        type="button"
        aria-label="Ask AI"
        onClick={() => {
          toggleEveChat();
        }}
        className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors duration-100 hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        <MessageSquare className="size-4.5" />
      </button>
    </>
  );
}
