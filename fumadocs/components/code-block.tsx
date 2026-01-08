'use client';

import * as React from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Language display names and icons
 */
const LANGUAGE_INFO: Record<string, { label: string; color: string }> = {
  typescript: { label: 'TypeScript', color: 'bg-blue-500' },
  ts: { label: 'TypeScript', color: 'bg-blue-500' },
  javascript: { label: 'JavaScript', color: 'bg-yellow-500' },
  js: { label: 'JavaScript', color: 'bg-yellow-500' },
  python: { label: 'Python', color: 'bg-green-500' },
  py: { label: 'Python', color: 'bg-green-500' },
  bash: { label: 'Bash', color: 'bg-gray-500' },
  sh: { label: 'Shell', color: 'bg-gray-500' },
  shell: { label: 'Shell', color: 'bg-gray-500' },
  json: { label: 'JSON', color: 'bg-orange-500' },
  yaml: { label: 'YAML', color: 'bg-pink-500' },
  yml: { label: 'YAML', color: 'bg-pink-500' },
  markdown: { label: 'Markdown', color: 'bg-purple-500' },
  md: { label: 'Markdown', color: 'bg-purple-500' },
  mdx: { label: 'MDX', color: 'bg-purple-500' },
  css: { label: 'CSS', color: 'bg-blue-400' },
  html: { label: 'HTML', color: 'bg-red-500' },
  sql: { label: 'SQL', color: 'bg-cyan-500' },
  graphql: { label: 'GraphQL', color: 'bg-pink-600' },
  rust: { label: 'Rust', color: 'bg-orange-600' },
  go: { label: 'Go', color: 'bg-cyan-600' },
  java: { label: 'Java', color: 'bg-red-600' },
  curl: { label: 'cURL', color: 'bg-green-600' },
  text: { label: 'Text', color: 'bg-gray-400' },
  plaintext: { label: 'Text', color: 'bg-gray-400' },
};

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Language for syntax highlighting (extracted from className)
   */
  'data-language'?: string;
  /**
   * Optional filename to display
   */
  filename?: string;
  /**
   * Raw code content for copy functionality
   */
  raw?: string;
}

/**
 * Enhanced code block with:
 * - Language label badge
 * - Copy button with feedback
 * - Optional filename display
 * - Consistent styling
 */
export function CodeBlock({
  children,
  className,
  'data-language': language,
  filename,
  raw,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);

  // Extract language from className if not provided
  const lang = language || extractLanguage(className);
  const langInfo = lang ? LANGUAGE_INFO[lang.toLowerCase()] : null;

  const handleCopy = async () => {
    // Get code content from raw prop or from pre element
    const code = raw || preRef.current?.textContent || '';

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="code-block-wrapper relative group my-4">
      {/* Header with language label and copy button */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2',
        'bg-fd-muted/50 border-b border-fd-border',
        'rounded-t-lg'
      )}>
        <div className="flex items-center gap-2">
          {langInfo ? (
            <>
              <span className={cn(
                'w-2 h-2 rounded-full',
                langInfo.color
              )} />
              <span className="text-xs font-medium text-fd-muted-foreground">
                {langInfo.label}
              </span>
            </>
          ) : (
            <>
              <Terminal className="w-3 h-3 text-fd-muted-foreground" />
              <span className="text-xs font-medium text-fd-muted-foreground">
                {filename || 'Code'}
              </span>
            </>
          )}
          {filename && langInfo && (
            <span className="text-xs text-fd-muted-foreground">
              {filename}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded',
            'text-fd-muted-foreground hover:text-fd-foreground',
            'hover:bg-fd-accent transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              <span className="text-green-500">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre
        ref={preRef}
        className={cn(
          'rounded-t-none rounded-b-lg',
          'overflow-x-auto',
          className
        )}
      >
        {children}
      </pre>
    </div>
  );
}

/**
 * Extract language from className like "language-typescript"
 */
function extractLanguage(className?: string): string | null {
  if (!className) return null;
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : null;
}

/**
 * Simple pre wrapper that adds copy functionality
 * Use this as a drop-in replacement for <pre>
 */
export function Pre({ children, ...props }: React.ComponentProps<'pre'>) {
  return (
    <CodeBlock {...props}>
      {children}
    </CodeBlock>
  );
}
