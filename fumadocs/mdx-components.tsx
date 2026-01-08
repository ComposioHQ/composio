import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { YouTube } from '@/components/youtube';
import { Tabs, Tab, TabsList, TabsTrigger, TabsContent } from 'fumadocs-ui/components/tabs';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Popup, PopupContent, PopupTrigger } from 'fumadocs-twoslash/ui';
import { ProviderCard, ProviderGrid } from '@/components/provider-card';
import { Figure } from '@/components/figure';
import { Video } from '@/components/video';
import { CapabilityCard, CapabilityList } from '@/components/capability-card';
import { ToolkitsLanding } from '@/components/toolkits/toolkits-landing';
import { CodeTabs } from '@/components/code-tabs';
import { Feedback } from '@/components/feedback';
import { H1, H2, H3, H4, H5, H6 } from '@/components/heading-anchor';
import {
  CalloutEnhanced,
  InfoCallout,
  WarningCallout,
  TipCallout,
  ImportantCallout,
} from '@/components/callout';
import { RelatedPages, RelatedLinks } from '@/components/related-pages';
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
    // Enhanced headings with anchor links and copy-to-clipboard
    h1: H1,
    h2: H2,
    h3: H3,
    h4: H4,
    h5: H5,
    h6: H6,
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
    // Code experience components
    CodeTabs,
    Feedback,
    // Enhanced callouts with icons
    CalloutEnhanced,
    InfoCallout,
    WarningCallout,
    TipCallout,
    ImportantCallout,
    // Cross-linking components
    RelatedPages,
    RelatedLinks,
    // Twoslash components for type-checked code examples
    Popup,
    PopupContent,
    PopupTrigger,
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
