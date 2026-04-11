'use client';

import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

const VERSIONS = [
  { value: '3.1', label: 'v3.1', badge: 'Latest' },
  { value: '3.0', label: 'v3.0' },
] as const;

export function NavVersionSelector() {
  const pathname = usePathname();
  const isReferencePage = pathname.startsWith('/reference');
  const isV3 = pathname.startsWith('/reference/v3/') || pathname === '/reference/v3';
  const version = isV3 ? '3.0' : '3.1';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isReferencePage) return null;

  const navigate = (newVersion: string) => {
    setOpen(false);
    if (newVersion === version) return;
    const path = window.location.pathname;

    if (newVersion === '3.0') {
      if (path === '/reference') {
        window.location.href = '/reference/v3';
      } else {
        window.location.href = path.replace('/reference/', '/reference/v3/');
      }
    } else if (newVersion === '3.1') {
      if (path === '/reference/v3') {
        window.location.href = '/reference';
      } else {
        window.location.href = path.replace('/reference/v3/', '/reference/');
      }
    }
  };

  const current = VERSIONS.find((v) => v.value === version)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-fd-accent/50"
        style={{
          borderColor: 'color-mix(in srgb, var(--composio-orange, #f97316) 40%, transparent)',
          color: 'var(--composio-orange, #f97316)',
        }}
      >
        {current.label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 min-w-[120px] overflow-hidden rounded-lg border border-fd-border bg-fd-popover p-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {VERSIONS.map((v) => (
            <button
              key={v.value}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(v.value);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                v.value === version
                  ? 'bg-fd-accent text-fd-accent-foreground font-medium'
                  : 'text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-foreground'
              }`}
            >
              <span>{v.label}</span>
              {'badge' in v && v.badge && (
                <span
                  className="rounded px-1 py-0.5 text-[10px] font-medium leading-none"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--composio-orange, #f97316) 15%, transparent)',
                    color: 'var(--composio-orange, #f97316)',
                  }}
                >
                  {v.badge}
                </span>
              )}
              {v.value === version && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-auto"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
