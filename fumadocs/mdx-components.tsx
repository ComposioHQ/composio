import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { YouTube } from '@/components/youtube';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    YouTube,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    ...components,
  };
}
