import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GitHubEditLinkProps {
  /**
   * Path to the file in the repository
   * e.g., 'content/docs/quickstart.mdx'
   */
  filePath: string;
  /**
   * GitHub repository (owner/repo format)
   * @default 'composiohq/composio'
   */
  repo?: string;
  /**
   * Branch name
   * @default 'next'
   */
  branch?: string;
  /**
   * Custom class name
   */
  className?: string;
}

/**
 * GitHub edit link component
 *
 * Links to the source file on GitHub for easy contributions.
 * Follows the pattern used by Stripe, Vercel, and other
 * developer-focused documentation sites.
 *
 * Usage:
 * ```tsx
 * <GitHubEditLink filePath="content/docs/quickstart.mdx" />
 * ```
 */
export function GitHubEditLink({
  filePath,
  repo = 'composiohq/composio',
  branch = 'next',
  className,
}: GitHubEditLinkProps) {
  // Construct the edit URL
  // Format: https://github.com/{owner}/{repo}/edit/{branch}/fumadocs/{filePath}
  const editUrl = `https://github.com/${repo}/edit/${branch}/fumadocs/${filePath}`;

  return (
    <a
      href={editUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Edit this page on GitHub (opens in new tab)"
      className={cn(
        'inline-flex items-center gap-2 text-sm text-muted-foreground',
        'hover:text-foreground transition-colors mb-4',
        className
      )}
    >
      <Pencil className="size-4" aria-hidden="true" />
      Edit this page on GitHub
    </a>
  );
}

/**
 * Compact variant for inline use
 */
export function GitHubEditLinkCompact({
  filePath,
  repo = 'composiohq/composio',
  branch = 'next',
}: GitHubEditLinkProps) {
  const editUrl = `https://github.com/${repo}/edit/${branch}/fumadocs/${filePath}`;

  return (
    <a
      href={editUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Edit this page on GitHub"
      aria-label="Edit this page on GitHub (opens in new tab)"
    >
      <Pencil className="size-3.5" aria-hidden="true" />
      <span className="sr-only">Edit on GitHub</span>
    </a>
  );
}
