import type { ReactNode } from 'react';

interface StepTitleProps {
  children: ReactNode;
}

/**
 * A visual heading for Steps that doesn't appear in the Table of Contents.
 * Use this instead of ### headings inside <Step> when you have multiple
 * tabs/frameworks that would otherwise duplicate TOC entries.
 */
export function StepTitle({ children }: StepTitleProps) {
  return (
    <div className="font-semibold text-lg text-fd-foreground mb-3">
      {children}
    </div>
  );
}
