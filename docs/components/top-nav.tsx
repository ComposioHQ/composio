'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/docs', label: 'Docs' },
  { href: '/docs/api', label: 'API' },
  { href: '/docs/examples', label: 'Examples' },
];

export function TopNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/docs') {
      return pathname === '/docs' || 
        (pathname.startsWith('/docs') && 
         !pathname.startsWith('/docs/api') && 
         !pathname.startsWith('/docs/examples'));
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-fd-border bg-fd-background">
      <div className="flex h-14 items-center px-6 gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/Composio Logo.svg"
            alt="Composio"
            width={110}
            height={20}
            className="dark:hidden"
            priority
          />
          <Image
            src="/Composio Logo Dark.svg"
            alt="Composio"
            width={110}
            height={20}
            className="hidden dark:block"
            priority
          />
        </Link>

        {/* Nav Items */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isActive(item.href)
                  ? 'text-[var(--orange)]'
                  : 'text-fd-muted-foreground hover:text-fd-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

      </div>
    </header>
  );
}

