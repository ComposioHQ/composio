import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';

/**
 * Links a docs subsection to the example-writeup section that demonstrates it.
 * A light blue tile — eye icon followed by one plain sentence — that opens the
 * example project (at the relevant section) in a new tab. Placed directly
 * above the section's "Implementation details" disclosure.
 *
 * Usage (in .mdx, registered globally):
 *   <ExampleCallout href="/examples/funnelwatch#handling-events">
 *     See how we verify, dedup, and route webhook events in a BI agent.
 *   </ExampleCallout>
 */
export function ExampleCallout({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="example-callout not-prose my-5 flex items-center gap-3 rounded-md px-4 py-3 no-underline"
    >
      <Eye aria-hidden="true" className="size-4 shrink-0" />
      <span className="text-sm leading-snug">{children}</span>
    </a>
  );
}
