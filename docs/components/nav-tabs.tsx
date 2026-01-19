'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/docs', label: 'Docs', exact: true },
  { href: '/docs/api', label: 'API' },
  { href: '/docs/examples', label: 'Examples' },
];

export function NavTabs() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      // For "Docs", only active if exactly /docs or /docs/ but not /docs/api
      return pathname === href || pathname === `${href}/` || 
        (pathname.startsWith('/docs') && !pathname.startsWith('/docs/api') && !pathname.startsWith('/docs/examples'));
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="nav-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`nav-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 rounded ${isActive(tab.href, tab.exact) ? 'active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

