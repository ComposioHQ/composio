'use client';

import Link from 'next/link';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center px-4">
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-fd-primary/20 via-fd-primary/5 to-transparent blur-2xl" />
        <h1 className="relative text-[120px] sm:text-[150px] font-bold leading-none tracking-tighter text-fd-foreground/10 select-none">
          500
        </h1>
      </div>

      <div className="mt-2 text-center max-w-md">
        <h2 className="text-xl font-semibold text-fd-foreground">
          Something went wrong
        </h2>
        <p className="mt-2 text-fd-muted-foreground text-sm">
          An unexpected error occurred. Try again or head back to the docs.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background px-4 py-2 text-sm font-medium transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
