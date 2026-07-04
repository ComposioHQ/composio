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
    <div className="not-prose mt-8 flex justify-end pt-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Edit this page on GitHub"
        title="Edit this page on GitHub"
        className="group inline-flex size-8 items-center justify-center rounded-[var(--composio-radius)] text-fd-muted-foreground transition-[background-color,color] duration-150 hover:bg-fd-secondary/50 hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background"
      >
        <Edit className="size-3.5 transition-transform duration-150 group-hover:-translate-y-px" aria-hidden="true" />
      </a>
    </div>
  );
}
