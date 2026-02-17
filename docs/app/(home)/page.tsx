import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 px-6 py-16">
      <h1 className="text-3xl md:text-4xl mb-4 font-medium tracking-tight" style={{ color: 'var(--composio-orange)' }}>
        Composio Documentation
      </h1>
      <p className="text-lg text-[var(--color-fd-muted-foreground)] max-w-xl mx-auto mb-8">
        Connect AI agents to 250+ tools with managed authentication.
      </p>
      <div className="flex gap-4 justify-center">
        <Link 
          href="/docs" 
          className="px-5 py-2.5 rounded-lg bg-[var(--color-fd-foreground)] text-[var(--color-fd-background)] font-medium hover:opacity-90 transition-opacity"
        >
          Get Started
        </Link>
        <Link 
          href="/docs/quickstart" 
          className="px-5 py-2.5 rounded-lg border border-[var(--color-fd-border)] font-medium hover:bg-[var(--color-fd-muted)] transition-colors"
        >
          Quickstart
        </Link>
      </div>
    </div>
  );
}
