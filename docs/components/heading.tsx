'use client';

import { cn } from '@fumadocs/ui/cn';
import { Link, Check } from 'lucide-react';
import { useState, type ComponentPropsWithoutRef } from 'react';

type HeadingProps = ComponentPropsWithoutRef<'h1'> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
};

export function Heading({ as, className, ...props }: HeadingProps) {
  const As = as ?? 'h1';

  if (!props.id) return <As className={className} {...props} />;

  return (
    <As
      className={cn(
        'flex scroll-m-28 flex-row items-center gap-2',
        className,
      )}
      {...props}
    >
      <HeadingAnchor id={props.id}>{props.children}</HeadingAnchor>
    </As>
  );
}

function HeadingAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${id}`;
    window.history.replaceState(null, '', `#${id}`);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    copyLink();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      copyLink();
    }
  };

  return (
    <>
      <a
        data-card=""
        href={`#${id}`}
        className="peer"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={`Copy link to ${id} section`}
      >
        {children}
      </a>
      {copied ? (
        <Check
          aria-hidden
          className="size-3.5 shrink-0 text-green-500 transition-opacity"
        />
      ) : (
        <Link
          aria-hidden
          className="size-3.5 shrink-0 text-fd-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100"
        />
      )}
    </>
  );
}
