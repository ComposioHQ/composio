import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';
import { Accordion as BaseAccordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Tabs, Tab, TabsList, TabsTrigger, TabsContent } from 'fumadocs-ui/components/tabs';
import { Callout } from 'fumadocs-ui/components/callout';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Heading } from '@/components/heading';
import { YouTube } from '@/components/youtube';
import { ProviderCard, ProviderGrid } from '@/components/provider-card';
import { FrameworkSelector, QuickstartFlow, FrameworkOption, PromptBanner } from '@/components/quickstart';
import { IntegrationTabs, IntegrationContent } from '@/components/quickstart/integration-tabs';
import { ToolTypeFlow, ToolTypeOption } from '@/components/tool-type-selector';
import { ConnectFlow, ConnectClientOption } from '@/components/connect-flow';
import { Figure } from '@/components/figure';
import { StepTitle } from '@/components/step-title';
import { Video } from '@/components/video';
import { CapabilityCard, CapabilityList } from '@/components/capability-card';
import { TemplateCard, TemplateGrid } from '@/components/template-card';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
import { ManagedAuthList } from '@/components/toolkits/managed-auth-list';
import { Mermaid } from '@/components/mermaid';
import { AIToolsBanner } from '@/components/ai-tools-banner';
import { Glossary, GlossaryTerm } from '@/components/glossary';
import { ApiBaseUrl } from '@/components/api-base-url';
import { ApiEndpointsTable } from '@/components/api-endpoints-table';
import {
  ShieldCheck,
  Route as RouteIcon,
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
  Monitor,
  MessageCircle,
  LayoutDashboard,
} from 'lucide-react';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function Accordion({ id, title, ...props }: ComponentProps<typeof BaseAccordion>) {
  return <BaseAccordion id={id ?? (typeof title === 'string' ? slugify(title) : undefined)} title={title} {...props} />;
}

export { Accordions };

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    h2: (props) => <Heading as="h2" {...props} />,
    h3: (props) => <Heading as="h3" {...props} />,
    h4: (props) => <Heading as="h4" {...props} />,
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
    PromptBanner,
    ToolTypeFlow,
    ToolTypeOption,
    ConnectFlow,
    ConnectClientOption,
    Figure,
    Video,
    CapabilityCard,
    CapabilityList,
    TemplateCard,
    TemplateGrid,
    ToolkitsLanding,
    ManagedAuthList,
    Mermaid,
    AIToolsBanner,
    StepTitle,
    Glossary,
    GlossaryTerm,
    ApiBaseUrl,
    ApiEndpointsTable,
    // Lucide icons
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
    Monitor,
    MessageCircle,
    LayoutDashboard,
    ...components,
  };
}
