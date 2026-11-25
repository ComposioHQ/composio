'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Tabs } from 'fumadocs-ui/components/ui/tabs';
import { TabsList, TabsTrigger } from 'fumadocs-ui/components/tabs';

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
      className="my-4 flex flex-col overflow-hidden rounded-xl border bg-fd-secondary"
    >
      <TabsList aria-label="Operating system">
        <TabsTrigger value="linux">Linux</TabsTrigger>
        <TabsTrigger value="macos">macOS</TabsTrigger>
        <TabsTrigger value="windows">Windows (experimental)</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}
