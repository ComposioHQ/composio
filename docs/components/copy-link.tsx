'use client';

import { useState } from 'react';
import { Link, Check } from 'lucide-react';

interface CopyLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function CopyLink({ href, children, className }: CopyLinkProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const fullUrl = `${window.location.origin}${href}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 group cursor-pointer whitespace-nowrap ${className}`}
      title="Copy link"
    >
      <span>{children}</span>
      {copied ? (
        <Check className="w-3 h-3 text-green-500" />
      ) : (
        <Link className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity" />
      )}
    </button>
  );
}
