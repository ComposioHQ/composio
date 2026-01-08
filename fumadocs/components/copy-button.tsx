'use client';

import * as React from 'react';
import { Check, Copy, Key } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Placeholder patterns to detect in code (for replacement)
 * Note: /g flag is required for replaceAll behavior
 */
const API_KEY_REPLACE_PATTERNS = [
  /\{\{API_KEY\}\}/g,
  /\{\{COMPOSIO_API_KEY\}\}/g,
  /YOUR_API_KEY/g,
  /your-api-key/g,
  /COMPOSIO_API_KEY/g,
  /<your-api-key>/g,
  /<API_KEY>/g,
];

/**
 * Detection patterns (without /g flag to avoid stateful .test() behavior)
 */
const API_KEY_DETECT_PATTERNS = [
  /\{\{API_KEY\}\}/,
  /\{\{COMPOSIO_API_KEY\}\}/,
  /YOUR_API_KEY/,
  /your-api-key/,
  /COMPOSIO_API_KEY/,
  /<your-api-key>/,
  /<API_KEY>/,
];

interface CopyButtonProps {
  /**
   * The code content to copy
   */
  code: string;
  /**
   * Custom class name
   */
  className?: string;
  /**
   * Whether to show the "with API key" option
   */
  showApiKeyOption?: boolean;
}

/**
 * Enhanced copy button with API key substitution
 *
 * Features:
 * - Standard copy functionality
 * - Detects API key placeholders
 * - Shows "Copy with API key" option when placeholders detected
 * - Uses env var NEXT_PUBLIC_COMPOSIO_API_KEY or prompts user
 *
 * Usage:
 * ```tsx
 * <CopyButton code={codeString} />
 * ```
 */
export function CopyButton({
  code,
  className,
  showApiKeyOption = true,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);

  // Check if code contains API key placeholders
  // Uses detection patterns without /g flag to avoid stateful .test() behavior
  const hasPlaceholders = React.useMemo(() => {
    return API_KEY_DETECT_PATTERNS.some((pattern) => pattern.test(code));
  }, [code]);

  // Get API key from env (for demo purposes) or localStorage
  const getApiKey = React.useCallback(() => {
    if (typeof window === 'undefined') return null;

    // Check localStorage for user's API key (wrapped in try-catch for private browsing)
    try {
      const savedKey = localStorage.getItem('composio-api-key');
      if (savedKey) return savedKey;
    } catch {
      // localStorage not available (private browsing)
    }

    // Could also check for env var in development
    return null;
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      // Modern clipboard API (preferred)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setShowMenu(false);
        return;
      }

      // Fallback for browsers without clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error('Failed to copy:', error);
    }
    setShowMenu(false);
  };

  const handleCopy = () => {
    if (hasPlaceholders && showApiKeyOption) {
      setShowMenu(true);
    } else {
      copyToClipboard(code);
    }
  };

  const handleCopyPlain = () => {
    copyToClipboard(code);
  };

  const handleCopyWithApiKey = () => {
    const apiKey = getApiKey();

    if (!apiKey) {
      // Prompt user for API key
      const key = window.prompt(
        'Enter your Composio API key:\n(Get it from https://app.composio.dev)',
        ''
      );
      if (key) {
        // Save to localStorage (wrapped in try-catch for private browsing)
        try {
          localStorage.setItem('composio-api-key', key);
        } catch {
          // localStorage not available
        }
        copyWithKey(key);
      }
      return;
    }

    copyWithKey(apiKey);
  };

  const copyWithKey = (apiKey: string) => {
    let processedCode = code;
    // Uses replacement patterns with /g flag to replace all occurrences
    API_KEY_REPLACE_PATTERNS.forEach((pattern) => {
      processedCode = processedCode.replace(pattern, apiKey);
    });
    copyToClipboard(processedCode);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={handleCopy}
        className={cn(
          'inline-flex items-center justify-center size-8 rounded-md',
          'text-muted-foreground hover:text-foreground hover:bg-accent',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-ring'
        )}
        aria-label={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <Check className="size-4 text-green-500" />
        ) : (
          <Copy className="size-4" />
        )}
      </button>

      {/* Dropdown menu for API key option */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div
            className={cn(
              'absolute right-0 top-full mt-1 z-50',
              'bg-popover border border-border rounded-md shadow-lg',
              'py-1 min-w-[180px]',
              'animate-in slide-in-from-top-2'
            )}
          >
            <button
              onClick={handleCopyPlain}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm',
                'hover:bg-accent transition-colors text-left'
              )}
            >
              <Copy className="size-4" />
              Copy as-is
            </button>
            <button
              onClick={handleCopyWithApiKey}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm',
                'hover:bg-accent transition-colors text-left',
                'text-composio-orange'
              )}
            >
              <Key className="size-4" />
              Copy with my API key
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Wrapper to detect API key placeholders in code blocks
 */
export function CodeBlockWithCopy({
  children,
  code,
}: {
  children: React.ReactNode;
  code: string;
}) {
  return (
    <div className="relative group">
      {children}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton code={code} />
      </div>
    </div>
  );
}
