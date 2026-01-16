'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';

interface ProviderCardProps {
  name: string;
  href: string;
  logo?: string;
  icon?: ReactNode;
  languages?: ('Python' | 'TypeScript')[];
}

export function ProviderCard({ name, href, logo, icon, languages }: ProviderCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-5 rounded-lg border border-fd-border bg-fd-card p-5 transition-all hover:bg-fd-accent/50 hover:border-[color-mix(in_srgb,var(--composio-orange)_50%,transparent)]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center">
        {logo ? (
          <Image
            src={logo}
            alt={`${name} logo`}
            width={48}
            height={48}
            className="h-10 w-auto dark:invert"
          />
        ) : icon ? (
          <span className="text-fd-muted-foreground">{icon}</span>
        ) : (
          <span className="text-2xl font-bold text-fd-muted-foreground/40">
            {name.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex flex-col justify-center gap-2">
        <span className="text-sm font-semibold text-fd-foreground">{name}</span>
        {languages && languages.length > 0 && (
          <div className="flex gap-2">
            {languages.map((lang) => (
              <span
                key={lang}
                className="rounded border border-fd-border bg-fd-muted/50 px-2 py-0.5 text-xs text-fd-muted-foreground"
              >
                {lang}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

export function ProviderGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose grid grid-cols-1 gap-3 sm:grid-cols-2">
      {children}
    </div>
  );
}
