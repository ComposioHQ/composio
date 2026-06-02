import { Edit } from 'lucide-react';

interface EditOnGitHubProps {
  /**
   * File path relative to the repository root, e.g. `docs/content/docs/index.mdx`
   * or `docs/components/toolkits/toolkit-detail.tsx`.
   */
  path: string;
  /** Defaults to the `next` branch. */
  sha?: string;
}

/**
 * "Edit this page on GitHub" link, rendered at the bottom of each docs page.
 * Links to the source file in the public Composio repo on the configured branch.
 */
export function EditOnGitHub({ path, sha = 'next' }: EditOnGitHubProps) {
  const href = `https://github.com/ComposioHQ/composio/blob/${sha}/${path}`;
  return (
    <div className="not-prose mt-12 flex justify-start border-t border-fd-border/60 pt-6">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-fd-muted-foreground hover:text-fd-foreground transition-colors"
      >
        <Edit className="size-3.5" aria-hidden="true" />
        <span>Edit this page on GitHub</span>
      </a>
    </div>
  );
}
