import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { YouTube } from '@/components/youtube';
import { Tabs, Tab, TabsList, TabsTrigger, TabsContent } from 'fumadocs-ui/components/tabs';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { ProviderCard, ProviderGrid } from '@/components/provider-card';
import { Figure } from '@/components/figure';
import { Video } from '@/components/video';
import { CapabilityCard, CapabilityList } from '@/components/capability-card';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
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
    img: (props) => <ImageZoom {...(props as any)} />,
    YouTube,
    Tabs,
    Tab,
    TabsList,
    TabsTrigger,
    TabsContent,
    Accordion,
    Accordions,
    Callout,
    Step,
    Steps,
    Card,
    Cards,
    ProviderCard,
    ProviderGrid,
    Figure,
    Video,
    CapabilityCard,
    CapabilityList,
    ToolkitsLanding,
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
