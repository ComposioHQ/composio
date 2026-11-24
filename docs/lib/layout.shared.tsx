import type { HomeLayoutProps } from 'fumadocs-ui/layouts/home';
import { DocsHeader } from '@/components/docs-header';

export function baseOptions(): HomeLayoutProps {
  return {
    nav: { title: null },
    slots: { header: DocsHeader },
    themeSwitch: { enabled: false },
  };
}
