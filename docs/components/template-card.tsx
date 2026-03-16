'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';

interface TemplateCardProps {
  title: string;
  description: string;
  href: string;
  image?: string;
}

export function TemplateCard({
  title,
  description,
  href,
  image,
}: TemplateCardProps) {
  const isVideo = image?.endsWith('.mp4') || image?.endsWith('.webm');

  if (image) {
    return (
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col sm:flex-row items-start gap-8 rounded-xl border border-fd-border bg-fd-card p-8 transition-all hover:border-[color-mix(in_srgb,var(--composio-orange)_50%,transparent)] [text-decoration:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
      >
        <div className="flex flex-col gap-3 sm:w-1/2 shrink-0 pt-2">
          <h3 className="text-xl font-bold text-fd-foreground">{title}</h3>
          <p className="text-sm text-fd-muted-foreground leading-relaxed">{description}</p>
        </div>
        <div className="overflow-hidden rounded-xl shadow-lg sm:w-1/2 max-w-sm">
          {isVideo ? (
            <video
              src={image}
              autoPlay
              loop
              muted
              playsInline
              aria-label={`${title} demo video`}
              className="w-full h-auto object-cover"
            />
          ) : (
            <Image
              src={image}
              alt={`${title} preview`}
              width={600}
              height={340}
              className="w-full h-auto object-cover"
              unoptimized={image.endsWith('.gif')}
            />
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl border border-fd-border bg-fd-card overflow-hidden transition-all hover:border-[color-mix(in_srgb,var(--composio-orange)_50%,transparent)] [text-decoration:none]"
    >
      <div className="flex items-center justify-between p-5 pb-3">
        <h3 className="text-base font-semibold text-fd-foreground">{title}</h3>
        <ExternalLink className="h-4 w-4 shrink-0 text-fd-muted-foreground" />
      </div>
      <div className="flex flex-col gap-3 p-5 pt-0 flex-1">
        <p className="text-sm text-fd-muted-foreground leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}

export function TemplateGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: 1 | 2 }) {
  return (
    <div className={`not-prose grid grid-cols-1 gap-5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
      {children}
    </div>
  );
}
