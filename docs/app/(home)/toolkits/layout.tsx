import type { ReactNode } from 'react';

export default function ToolkitsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}
