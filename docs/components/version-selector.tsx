'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from 'fumadocs-ui/components/ui/popover';
import { detectApiVersion, isReferenceUrl, toCurrentVersionUrl } from '@/lib/api-version';

export function NavVersionSelector() {
  const pathname = usePathname();
  if (!isReferenceUrl(pathname)) return null;
  const version = detectApiVersion(pathname);
  const currentUrl = toCurrentVersionUrl(pathname);
  const legacyUrl =
    currentUrl === '/reference'
      ? '/reference/v3'
      : currentUrl.startsWith('/reference/authenticating-to-composio')
        ? '/reference/v3/authentication'
        : currentUrl.replace('/reference/', '/reference/v3/');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="docs-version-trigger"
          aria-label={`API version: v${version}. Switch version`}
        >
          <span className="docs-version-prefix">API</span> v{version}
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        collisionPadding={8}
        align="end"
        sideOffset={4}
        className="docs-navigation-menu docs-version-menu"
        aria-label="API version"
      >
        {[
          { value: '3.1', url: currentUrl },
          { value: '3.0', url: legacyUrl },
        ].map(option => (
          <PopoverClose asChild key={option.value}>
            <Link
              className="docs-menu-link"
              href={option.url}
              aria-current={option.value === version ? 'page' : undefined}
            >
              <span>
                v{option.value}
                {option.value === '3.1' && <span className="docs-version-latest">Latest</span>}
              </span>
              {option.value === version && <Check aria-hidden="true" className="size-4" />}
            </Link>
          </PopoverClose>
        ))}
      </PopoverContent>
    </Popover>
  );
}
