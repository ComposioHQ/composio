'use client';

import Link from 'fumadocs-core/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ExternalLink, Menu, Play, X } from 'lucide-react';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from 'fumadocs-ui/components/ui/popover';
import {
  activeDocsSection,
  DOCS_NAVIGATION,
  PLAYGROUND_URL,
  type DocsNavLink,
  type DocsNavId,
} from '@/lib/docs-navigation';
import { ProductNavTitle } from './product-switcher';
import { SearchAndAskAI, SearchAndAskAIMobile } from './ask-ai-button';
import { NavVersionSelector } from './version-selector';

function MenuLinks({ links, pathname }: { links: readonly DocsNavLink[]; pathname: string }) {
  return links.map(link => (
    <PopoverClose asChild key={link.url}>
      <Link
        className="docs-menu-link"
        href={link.url}
        aria-current={pathname === link.url ? 'page' : undefined}
      >
        {link.text}
        {link.external && <ExternalLink aria-hidden="true" className="size-3.5" />}
      </Link>
    </PopoverClose>
  ));
}

export function DocsHeader() {
  const pathname = usePathname();
  const active = activeDocsSection(pathname);
  const currentSection = DOCS_NAVIGATION.find(section => section.id === active)!;
  const [openMenu, setOpenMenu] = useState<DocsNavId | 'mobile' | null>(null);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const close = () => setOpenMenu(null);
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, []);

  return (
    <header id="nd-nav" className="docs-header">
      <div className="docs-utility-row">
        <ProductNavTitle />
        <div className="docs-header-tools">
          <div className="docs-header-search">
            <SearchAndAskAI />
          </div>
          <div className="docs-header-search-compact">
            <SearchAndAskAIMobile />
          </div>
          <Link className="docs-playground-link" href={PLAYGROUND_URL}>
            <Play aria-hidden="true" className="size-3.5" />
            Playground
          </Link>
        </div>
      </div>
      <div className="docs-section-row">
        <nav aria-label="Documentation" className="docs-desktop-navigation">
          {DOCS_NAVIGATION.map(section =>
            section.type === 'link' ? (
              <Link
                key={section.id}
                className="docs-section-link"
                data-active={active === section.id}
                aria-current={active === section.id ? 'location' : undefined}
                href={section.url}
              >
                {section.text}
              </Link>
            ) : (
              <Popover
                key={section.id}
                open={openMenu === section.id}
                onOpenChange={open => setOpenMenu(open ? section.id : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className="docs-section-link"
                    data-active={active === section.id}
                    aria-current={active === section.id ? 'location' : undefined}
                    type="button"
                  >
                    {section.text}
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  collisionPadding={8}
                  align="start"
                  sideOffset={4}
                  className="docs-navigation-menu"
                  aria-label={section.text}
                >
                  <MenuLinks links={section.links} pathname={pathname} />
                  {section.footerLinks && (
                    <div className="docs-menu-footer">
                      <MenuLinks links={section.footerLinks} pathname={pathname} />
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )
          )}
        </nav>
        <nav className="docs-mobile-navigation" aria-label="Documentation">
          <Popover
            open={openMenu === 'mobile'}
            onOpenChange={open => setOpenMenu(open ? 'mobile' : null)}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="docs-mobile-nav-trigger"
                aria-label={`Documentation navigation. Current section: ${currentSection.text}`}
              >
                <Menu aria-hidden="true" className="size-4" />
                {currentSection.text}
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              collisionPadding={8}
              align="start"
              sideOffset={4}
              className="docs-navigation-menu docs-mobile-menu"
              aria-label="Documentation navigation"
            >
              <div className="docs-mobile-menu-heading">
                <span>Documentation</span>
                <PopoverClose aria-label="Close navigation" className="docs-menu-close">
                  <X aria-hidden="true" className="size-4" />
                </PopoverClose>
              </div>
              {DOCS_NAVIGATION.map(section =>
                section.type === 'link' ? (
                  <PopoverClose asChild key={section.id}>
                    <Link
                      className="docs-menu-link"
                      data-active={active === section.id}
                      aria-current={active === section.id ? 'location' : undefined}
                      href={section.url}
                    >
                      {section.text}
                    </Link>
                  </PopoverClose>
                ) : (
                  <details
                    key={section.id}
                    name="docs-mobile-sections"
                    className="docs-mobile-menu-group"
                  >
                    <summary data-active={active === section.id}>
                      {section.text}
                      <ChevronDown aria-hidden="true" className="size-3.5" />
                    </summary>
                    <div className="docs-mobile-menu-links">
                      <MenuLinks links={section.links} pathname={pathname} />
                      {section.footerLinks && (
                        <div className="docs-menu-footer">
                          <MenuLinks links={section.footerLinks} pathname={pathname} />
                        </div>
                      )}
                    </div>
                  </details>
                )
              )}
            </PopoverContent>
          </Popover>
        </nav>
        <NavVersionSelector />
      </div>
    </header>
  );
}
