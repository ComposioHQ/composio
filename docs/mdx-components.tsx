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
import { FrameworkSelector, QuickstartFlow, FrameworkOption } from '@/components/quickstart';
import { IntegrationTabs, IntegrationContent } from '@/components/quickstart/integration-tabs';
import { ToolTypeFlow, ToolTypeOption } from '@/components/tool-type-selector';
import { Figure } from '@/components/figure';
import { StepTitle } from '@/components/step-title';
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
  Play,
  Terminal,
  Palette,
  BookOpen,
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
    FrameworkSelector,
    QuickstartFlow,
    FrameworkOption,
    IntegrationTabs,
    IntegrationContent,
    ToolTypeFlow,
    ToolTypeOption,
    Figure,
    Video,
    CapabilityCard,
    CapabilityList,
    ToolkitsLanding,
    StepTitle,
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
    Play,
    Terminal,
    Palette,
    BookOpen,
    ...components,
  };
}
