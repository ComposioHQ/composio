'use client';

import { Tabs as FumadocsTabs, type TabsProps } from 'fumadocs-ui/components/tabs';

const labels: Record<string, string | undefined> = {
  language: 'Example language',
  'python-mode': 'Python execution mode',
};

/** Name the selectors while keeping Fumadocs' keyboard and persistence behavior. */
export function ExampleTabs({ groupId, ...props }: TabsProps) {
  const name = groupId && Object.hasOwn(labels, groupId) ? labels[groupId] : undefined;
  if (!name) return <FumadocsTabs {...props} groupId={groupId} />;
  return (
    <FumadocsTabs {...props} groupId={groupId} ref={(root) => {
      root?.querySelector(':scope > [role="tablist"]')?.setAttribute('aria-label', name);
    }} />
  );
}
