'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from 'fumadocs-ui/components/ui/tabs';
import { Laptop, Monitor, Terminal } from 'lucide-react';

// Keep server HTML and the first hydration render on Linux. Detection is only a
// convenience: choosing a tab always takes precedence, without storing a preference.
const subscribe = () => () => {};
const serverPlatform = () => 'linux';

export function detectCliPlatform(userAgent: string, maxTouchPoints: number): string {
  if (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
  )
    return 'linux';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos';
  return 'linux';
}

function browserPlatform() {
  return detectCliPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

export function CliInstallTabs({ children }: { children: ReactNode }) {
  const detected = useSyncExternalStore(subscribe, browserPlatform, serverPlatform);
  const [selected, setSelected] = useState<string>();

  return (
    <Tabs
      value={selected ?? detected}
      onValueChange={setSelected}
      className="not-prose my-6 [&_[role=tabpanel]]:rounded-none [&_[role=tabpanel]]:bg-transparent [&_[role=tabpanel]]:px-0 [&_[role=tabpanel]]:pb-0 [&_figure]:my-0 [&_figure_[role=region]]:py-5 [&_pre]:w-full [&_pre]:min-w-0 [&_pre]:whitespace-pre-wrap [&_pre]:text-sm md:[&_pre]:text-base [&_code]:break-all"
    >
      <TabsList aria-label="Operating system" className="mx-auto grid max-w-sm grid-cols-3 gap-3">
        {[
          { value: 'macos', label: 'macOS', Icon: Laptop },
          { value: 'linux', label: 'Linux', Icon: Terminal },
          { value: 'windows', label: 'Windows', Icon: Monitor },
        ].map(({ value, label, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-fd-border bg-fd-card p-3 text-sm font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 data-[state=active]:border-fd-primary data-[state=active]:bg-fd-primary/5 data-[state=active]:text-fd-primary"
          >
            <Icon aria-hidden className="size-6" />
            <span>{label}</span>
            {value === 'windows' && <span className="text-[0.625rem]">Experimental</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
