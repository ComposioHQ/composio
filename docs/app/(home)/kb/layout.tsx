import type { ReactNode } from 'react';

export default function KnowledgeBaseLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-fd-background text-fd-foreground">{children}</div>;
}
