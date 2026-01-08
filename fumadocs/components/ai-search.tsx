'use client';

import type { SharedProps } from 'fumadocs-ui/components/dialog/search';
import {
  InkeepModalSearchAndChat,
  type InkeepModalSearchAndChatProps,
} from '@inkeep/cxkit-react';
import { useEffect, useState } from 'react';

/**
 * AI-powered search dialog using Inkeep
 *
 * Features:
 * - Full-text search across all documentation
 * - AI chat for answering questions
 * - Dark/light mode sync with site theme
 * - Example questions to guide users
 *
 * Configuration:
 * - Set NEXT_PUBLIC_INKEEP_API_KEY in your environment
 * - Or pass apiKey prop directly
 */
interface AISearchProps extends SharedProps {
  apiKey?: string;
}

export default function AISearchDialog({ open, onOpenChange, apiKey }: AISearchProps) {
  const [syncTarget, setSyncTarget] = useState<HTMLElement | null>(null);

  // Set syncTarget after mount to avoid SSR/hydration issues
  // This is a valid pattern for hydration-safe browser API access
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync with external DOM element
    setSyncTarget(document.documentElement);
  }, []);

  // Use env variable or prop
  const inkeepApiKey = apiKey || process.env.NEXT_PUBLIC_INKEEP_API_KEY || '';

  // If no API key, fall back to basic behavior (users should configure this)
  if (!inkeepApiKey) {
    console.warn(
      '[AISearch] No Inkeep API key found. Set NEXT_PUBLIC_INKEEP_API_KEY in your environment.'
    );
    return null;
  }

  const config: InkeepModalSearchAndChatProps = {
    baseSettings: {
      apiKey: inkeepApiKey,
      primaryBrandColor: '#ea580c', // Composio orange
      organizationDisplayName: 'Composio',
      colorMode: {
        sync: {
          target: syncTarget,
          attributes: ['class'],
          isDarkMode: (attributes) => !!attributes.class?.includes('dark'),
        },
      },
    },
    modalSettings: {
      isOpen: open,
      onOpenChange,
    },
    searchSettings: {
      placeholder: 'Search docs or ask a question...',
    },
    aiChatSettings: {
      aiAssistantName: 'Composio AI',
      exampleQuestions: [
        'How do I connect my first tool?',
        'What is the Tool Router?',
        'How do I authenticate with OAuth?',
        'Show me a quickstart example',
      ],
    },
  };

  return <InkeepModalSearchAndChat {...config} />;
}

/**
 * Standalone AI chat button (floating)
 * Can be added independently of search
 */
export function AISearchTrigger() {
  // This is handled by the RootProvider search configuration
  // The trigger button is provided by fumadocs-ui
  return null;
}
