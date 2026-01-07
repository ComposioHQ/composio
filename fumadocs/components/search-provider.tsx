'use client';

import dynamic from 'next/dynamic';

/**
 * Dynamically import AI search to avoid SSR issues
 * This component must be a client component to use dynamic with ssr: false
 */
const AISearchDialog = dynamic(() => import('@/components/ai-search'), {
  ssr: false,
});

export { AISearchDialog };
