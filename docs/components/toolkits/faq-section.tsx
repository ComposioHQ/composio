'use client';

import { HelpCircle } from 'lucide-react';
import { Accordion, Accordions } from '@/mdx-components';

export interface FaqItem {
  question: string;
  answer: string;
}

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
      <Accordions type="single">
        {faq.map((item) => (
          <Accordion key={item.question} title={item.question}>
            <div
              className="prose prose-sm prose-fd max-w-none text-fd-muted-foreground"
              dangerouslySetInnerHTML={{ __html: item.answer }}
            />
          </Accordion>
        ))}
      </Accordions>
    </div>
  );
}
