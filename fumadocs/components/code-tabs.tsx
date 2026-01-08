'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/**
 * Language preference key for localStorage
 */
const LANGUAGE_PREFERENCE_KEY = 'composio-preferred-language';

/**
 * Supported languages with display names and icons
 */
const LANGUAGES = {
  typescript: { label: 'TypeScript', icon: '📘' },
  python: { label: 'Python', icon: '🐍' },
  javascript: { label: 'JavaScript', icon: '📒' },
  curl: { label: 'cURL', icon: '🔧' },
  bash: { label: 'Bash', icon: '💻' },
} as const;

type Language = keyof typeof LANGUAGES;

interface CodeTabsProps {
  children: React.ReactNode;
  defaultValue?: Language;
  /**
   * Whether to persist language preference
   * @default true
   */
  persist?: boolean;
}

/**
 * CodeTabs - Language switching tabs for code examples
 *
 * Usage in MDX:
 * ```mdx
 * <CodeTabs>
 *   <Tab value="typescript">
 *     ```typescript
 *     const composio = new Composio({ apiKey: 'your-key' });
 *     ```
 *   </Tab>
 *   <Tab value="python">
 *     ```python
 *     composio = Composio(api_key="your-key")
 *     ```
 *   </Tab>
 * </CodeTabs>
 * ```
 */
export function CodeTabs({
  children,
  defaultValue = 'typescript',
  persist = true,
}: CodeTabsProps) {
  // Use null initially to detect mounted state and avoid hydration mismatch
  const [mounted, setMounted] = React.useState(false);
  const [value, setValue] = React.useState<string>(defaultValue);

  // Load saved preference on mount (after hydration)
  React.useEffect(() => {
    setMounted(true);
    if (persist) {
      const saved = localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
      if (saved && saved in LANGUAGES) {
        setValue(saved);
      }
    }
  }, [persist]);

  // Save preference when changed
  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    if (persist && typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_PREFERENCE_KEY, newValue);

      // Sync all CodeTabs on the page
      window.dispatchEvent(
        new CustomEvent('composio-language-change', { detail: newValue })
      );
    }
  };

  // Listen for changes from other CodeTabs
  React.useEffect(() => {
    if (!persist || !mounted) return;

    const handleLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail && customEvent.detail in LANGUAGES) {
        setValue(customEvent.detail);
      }
    };

    window.addEventListener('composio-language-change', handleLanguageChange);
    return () => {
      window.removeEventListener('composio-language-change', handleLanguageChange);
    };
  }, [persist, mounted]);

  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={handleValueChange}
      className="code-tabs not-prose"
    >
      {children}
    </TabsPrimitive.Root>
  );
}

interface CodeTabProps {
  value: Language;
  children: React.ReactNode;
}

/**
 * Individual tab content for CodeTabs
 */
export function CodeTab({ value, children }: CodeTabProps) {
  return (
    <TabsPrimitive.Content value={value} className="mt-0">
      {children}
    </TabsPrimitive.Content>
  );
}

/**
 * Tabs list with language labels
 */
export function CodeTabsList({
  languages,
}: {
  languages: Language[];
}) {
  return (
    <TabsPrimitive.List className={cn(
      'flex items-center gap-1 border-b border-border mb-2',
      'overflow-x-auto'
    )}>
      {languages.map((lang) => {
        const info = LANGUAGES[lang] || { label: lang, icon: '📄' };
        return (
          <TabsPrimitive.Trigger
            key={lang}
            value={lang}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm',
              'border-b-2 border-transparent -mb-px',
              'text-muted-foreground hover:text-foreground',
              'data-[state=active]:border-composio-orange data-[state=active]:text-foreground',
              'transition-colors focus:outline-none'
            )}
          >
            <span className="text-base">{info.icon}</span>
            {info.label}
          </TabsPrimitive.Trigger>
        );
      })}
    </TabsPrimitive.List>
  );
}

// Re-export primitives for advanced usage
export const CodeTabContent = TabsPrimitive.Content;
export const CodeTabTrigger = TabsPrimitive.Trigger;
export const CodeTabList = TabsPrimitive.List;
