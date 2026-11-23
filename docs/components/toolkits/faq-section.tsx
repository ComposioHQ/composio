'use client';

import { HelpCircle } from 'lucide-react';
import { Tab } from 'fumadocs-ui/components/tabs';
import { ExampleTabs } from '@/components/example-tabs';
import type { FaqAnswerPart, FaqItem } from '@/lib/toolkit-faq';

export type { FaqItem } from '@/lib/toolkit-faq';

interface FaqSectionProps {
  faq: FaqItem[];
}

function Answer({ parts }: { parts: FaqAnswerPart[] }) {
  return parts.map((part, index) => part.type === 'html' ? (
    <div key={index} className="prose prose-sm prose-fd max-w-none overflow-x-auto text-fd-muted-foreground"
      dangerouslySetInnerHTML={{ __html: part.html }}
    />
  ) : (
    <ExampleTabs key={index} groupId={part.groupId} items={part.tabs.map((tab) => tab.value)} persist>
      {part.tabs.map((tab) => (
        <Tab key={tab.value} value={tab.value}><Answer parts={tab.parts} /></Tab>
      ))}
    </ExampleTabs>
  ));
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
              className="cursor-pointer px-3 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-fd-ring"
            >
              {item.question}
            </summary>
            {/* Target the answer so native fragment navigation opens its details. */}
            <div
              id={item.question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}
              className="scroll-m-24 px-4 pb-2"
            >
              <Answer parts={item.answer} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
