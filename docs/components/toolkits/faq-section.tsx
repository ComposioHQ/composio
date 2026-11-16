'use client';

import { HelpCircle } from 'lucide-react';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import type { FaqItem } from '@/lib/toolkit-faq';

export type { FaqItem } from '@/lib/toolkit-faq';

interface FaqSectionProps {
  faq: FaqItem[];
}

export function FaqSection({ faq }: FaqSectionProps) {
  if (!faq || faq.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-fd-foreground">
        <HelpCircle className="h-4 w-4" />
        Frequently Asked Questions
      </h2>
      <div className="divide-y divide-fd-border overflow-hidden rounded-lg border bg-fd-card">
        {faq.map((item) => (
          <details key={item.question}>
            <summary
              id={item.question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}
              className="cursor-pointer scroll-m-24 px-3 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-fd-ring"
            >
              {item.question}
            </summary>
            <div className="px-4 pb-2">
              {item.answer.map((part, index) => part.type === 'html' ? (
                <div key={index}
                  className="prose prose-sm prose-fd max-w-none text-fd-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: part.html }}
                />
              ) : (
                <Tabs key={index} groupId="language" items={part.tabs.map((tab) => tab.value)} persist>
                  {part.tabs.map((tab) => (
                    <Tab key={tab.value} value={tab.value}>
                      <div className="prose prose-sm prose-fd max-w-none overflow-x-auto"
                        dangerouslySetInnerHTML={{ __html: tab.html }}
                      />
                    </Tab>
                  ))}
                </Tabs>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
