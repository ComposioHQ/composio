import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { YouTube } from '@/components/youtube';
import { Tabs, Tab, TabsList, TabsTrigger, TabsContent } from 'fumadocs-ui/components/tabs';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { ProviderCard, ProviderGrid } from '@/components/provider-card';
import { CapabilityCard, CapabilityList } from '@/components/capability-card';
import { ShieldCheck, Route as RouteIcon } from 'lucide-react';
import {
  Key,
  Wrench,
  Database,
  Zap,
  Rocket,
  Code,
  Blocks,
  Plug,
} from 'lucide-react';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    YouTube,
    Tabs,
    Tab,
    TabsList,
    TabsTrigger,
    TabsContent,
    Accordion,
    Accordions,
    Callout,
    ProviderCard,
    ProviderGrid,
    CapabilityCard,
    CapabilityList,
    // Lucide icons - available globally in MDX without imports
    ShieldCheck,
    RouteIcon,
    Key,
    Wrench,
    Database,
    Zap,
    Rocket,
    Code,
    Blocks,
    Plug,
    ...components,
  };
}
