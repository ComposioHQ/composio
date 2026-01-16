import { ReactNode } from 'react';
import Link from 'next/link';

interface CapabilityCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
}

export function CapabilityCard({ icon, title, description, href }: CapabilityCardProps) {
  return (
    <Link
      href={href}
      data-card
      className="block p-6 rounded-xl border border-fd-border bg-fd-card hover:border-orange-500 hover:bg-fd-accent/50 transition-all [text-decoration:none] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
    >
      <div className="text-orange-500 mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-orange-500 mb-2">{title}</h3>
      <p className="text-fd-muted-foreground text-sm leading-relaxed">{description}</p>
    </Link>
  );
}

export function CapabilityList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
