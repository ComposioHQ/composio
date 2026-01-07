'use client';

import * as React from 'react';
import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingAnchorProps {
  id?: string;
  level: HeadingLevel;
  children: React.ReactNode;
  className?: string;
}

// Mapping of heading levels to components
const HeadingTags = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
} as const;

/**
 * Heading component with anchor link support
 *
 * Features:
 * - Stable anchor IDs for deep linking
 * - Hover-reveal link icon
 * - Click to copy URL with hash
 * - Scroll offset for fixed header
 * - Accessible: aria-label, focus states
 *
 * Usage:
 * ```tsx
 * <HeadingAnchor level={2} id="getting-started">
 *   Getting Started
 * </HeadingAnchor>
 * ```
 */
export function HeadingAnchor({
  id,
  level,
  children,
  className,
}: HeadingAnchorProps) {
  const [copied, setCopied] = React.useState(false);
  const Tag = HeadingTags[level];

  // Generate ID from children if not provided
  const headingId = id || generateId(children);

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();

    const url = `${window.location.origin}${window.location.pathname}#${headingId}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for browsers without clipboard API
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Navigate to the anchor as fallback
      window.location.hash = headingId;
    }
  };

  return (
    <Tag
      id={headingId}
      className={cn(
        'group relative scroll-mt-20',
        className
      )}
    >
      {children}
      <a
        href={`#${headingId}`}
        onClick={handleCopyLink}
        className={cn(
          'ml-2 inline-flex items-center opacity-0 transition-opacity',
          'group-hover:opacity-100 focus:opacity-100',
          'text-muted-foreground hover:text-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'
        )}
        aria-label={copied ? 'Link copied!' : `Link to ${getTextContent(children)}`}
      >
        {copied ? (
          <span className="text-xs text-green-600 dark:text-green-400">Copied!</span>
        ) : (
          <Link2 className="size-4" />
        )}
      </a>
    </Tag>
  );
}

/**
 * Generate a URL-safe ID from heading content
 */
function generateId(children: React.ReactNode): string {
  const text = getTextContent(children);
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .trim();
}

/**
 * Extract text content from React children
 */
function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children.map(getTextContent).join('');
  }
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    if (props.children) {
      return getTextContent(props.children);
    }
  }
  return '';
}

/**
 * Pre-configured heading components for MDX
 */
export const H1 = (props: Omit<HeadingAnchorProps, 'level'>) => (
  <HeadingAnchor level={1} {...props} />
);
export const H2 = (props: Omit<HeadingAnchorProps, 'level'>) => (
  <HeadingAnchor level={2} {...props} />
);
export const H3 = (props: Omit<HeadingAnchorProps, 'level'>) => (
  <HeadingAnchor level={3} {...props} />
);
export const H4 = (props: Omit<HeadingAnchorProps, 'level'>) => (
  <HeadingAnchor level={4} {...props} />
);
export const H5 = (props: Omit<HeadingAnchorProps, 'level'>) => (
  <HeadingAnchor level={5} {...props} />
);
export const H6 = (props: Omit<HeadingAnchorProps, 'level'>) => (
  <HeadingAnchor level={6} {...props} />
);
