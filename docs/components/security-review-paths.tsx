import { ClipboardCheck, Code, Network } from 'lucide-react';
import type { ReactNode } from 'react';

const icons = {
  evaluate: ClipboardCheck,
  vendor: Network,
  build: Code,
};

export function SecurityReviewPaths({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose @container my-6">
      <div className="grid grid-cols-1 gap-4 @min-[38rem]:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

export function SecurityReviewPath({
  audience,
  children,
}: {
  audience: keyof typeof icons;
  children: ReactNode;
}) {
  const Icon = icons[audience];

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-fd-border bg-fd-card shadow-[0_1px_0_rgba(15,15,15,0.04)]">
      <div className="px-5 pt-5">
        <span className="mb-4 flex size-9 items-center justify-center rounded-lg border border-fd-border bg-fd-background text-fd-foreground/75">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col [&>h3]:px-5 [&>h3]:text-pretty [&>h3]:text-[17px] [&>h3]:font-medium [&>h3]:leading-snug [&>h3]:tracking-tight [&>h3]:text-fd-foreground [&>p]:px-5 [&>p]:pt-2 [&>p]:pb-5 [&>p]:text-[13px] [&>p]:leading-relaxed [&>p]:text-fd-muted-foreground [&>ul]:mt-auto [&>ul]:list-none [&>ul]:divide-y [&>ul]:divide-fd-border [&>ul]:border-t [&>ul]:border-fd-border [&_ul_a]:block [&_ul_a]:px-5 [&_ul_a]:py-3 [&_ul_a]:text-[13px] [&_ul_a]:font-medium [&_ul_a]:text-fd-foreground [&_ul_a]:no-underline [&_ul_a]:transition-colors [&_ul_a:hover]:bg-fd-accent/40 [&_ul_a:focus-visible]:outline-2 [&_ul_a:focus-visible]:outline-offset-[-2px] [&_ul_a:focus-visible]:outline-fd-ring">
        {children}
      </div>
    </article>
  );
}
