import type { ReactNode } from 'react';

export default function KnowledgeBaseLayout({ children }: { children: ReactNode }) {
  return <div className="flex-1 bg-fd-background text-fd-foreground">{children}</div>;
}
