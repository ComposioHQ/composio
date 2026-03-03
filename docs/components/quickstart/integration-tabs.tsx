'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReactNode } from 'react';

interface TabConfig {
  value: string;
  label: string;
  icon?: string;
  iconDark?: string;
}

const defaultTabs: TabConfig[] = [
  { value: 'native', label: 'Native Tools', icon: '/images/providers/native-tools-logo.svg', iconDark: '/images/providers/native-tools-logo-dark.svg' },
  { value: 'mcp', label: 'MCP', icon: '/images/mcp-logo.svg', iconDark: '/images/mcp-logo-dark.svg' },
];

interface IntegrationTabsProps {
  children: ReactNode;
  defaultValue?: string;
  tabs?: TabConfig[];
}

export function IntegrationTabs({ children, defaultValue, tabs = defaultTabs }: IntegrationTabsProps) {
  return (
    <Tabs defaultValue={defaultValue ?? tabs[0]?.value ?? 'native'} className="not-prose -mt-2">
      <div className="mb-5 flex items-center gap-3">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
              {tab.icon && tab.iconDark && (
                <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <Image
                    src={tab.icon}
                    alt={tab.label}
                    width={16}
                    height={16}
                    className="h-4 w-4 dark:hidden"
                  />
                  <Image
                    src={tab.iconDark}
                    alt={tab.label}
                    width={16}
                    height={16}
                    className="hidden h-4 w-4 dark:block"
                  />
                </div>
              )}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Link href="/docs/native-tools-vs-mcp" className="text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors">
          Which should I use?
        </Link>
      </div>
      {children}
    </Tabs>
  );
}

export function IntegrationContent({
  value,
  children
}: {
  value: string;
  children: ReactNode;
}) {
  return <TabsContent value={value}>{children}</TabsContent>;
}
