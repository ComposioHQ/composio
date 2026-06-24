import type { ReactNode } from 'react';

/**
 * Lays out its two children side-by-side (explanatory text + a visual/terminal)
 * once the screen is wide enough, stacking them on narrower viewports. Drop a
 * markdown paragraph and a component inside it in MDX:
 *
 *   <MediaSplit>
 *   Some explanatory copy…
 *
 *   <InChatAuthTerminal … />
 *   </MediaSplit>
 */
export function MediaSplit({ children }: { children: ReactNode }) {
  return (
    <div className="mt-16 mb-6 grid items-start gap-6 lg:grid-cols-2 lg:gap-10 [&>*]:my-0 [&>*>:first-child]:mt-0">
      {children}
    </div>
  );
}
