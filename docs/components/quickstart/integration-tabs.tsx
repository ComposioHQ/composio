'use client';

import Image from 'next/image';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReactNode } from 'react';

interface IntegrationTabsProps {
  children: ReactNode;
  defaultValue?: 'native' | 'mcp';
}

export function IntegrationTabs({ children, defaultValue = 'native' }: IntegrationTabsProps) {
  return (
    <Tabs defaultValue={defaultValue} className="not-prose -mt-2">
      <div className="mb-5 flex justify-start">
        <TabsList>
          <TabsTrigger value="native" className="gap-2">
            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              <Image
                src="/images/providers/native-tools-logo.svg"
                alt="Native Tools"
                width={16}
                height={16}
                className="h-4 w-4 dark:hidden"
              />
              <Image
                src="/images/providers/native-tools-logo-dark.svg"
                alt="Native Tools"
                width={16}
                height={16}
                className="hidden h-4 w-4 dark:block"
              />
            </div>
            Native Tools
          </TabsTrigger>
          <TabsTrigger value="mcp" className="gap-2">
            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              <Image
                src="/images/mcp-logo.svg"
                alt="MCP"
                width={16}
                height={16}
                className="h-4 w-4 dark:hidden"
              />
              <Image
                src="/images/mcp-logo-dark.svg"
                alt="MCP"
                width={16}
                height={16}
                className="hidden h-4 w-4 dark:block"
              />
            </div>
            MCP
          </TabsTrigger>
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}

export function IntegrationContent({
  value,
  children
}: {
  value: 'native' | 'mcp';
  children: ReactNode;
}) {
  return <TabsContent value={value}>{children}</TabsContent>;
}
