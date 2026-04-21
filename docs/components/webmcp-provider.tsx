'use client';

import { useEffect } from 'react';

type WebMCPToolArgs = Record<string, unknown>;

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: WebMCPToolArgs) => Promise<unknown>;
}

declare global {
  interface Navigator {
    modelContext?: {
      provideContext?: (context: { tools: WebMCPTool[] }) => void | Promise<void>;
    };
  }
}

function buildTools(): WebMCPTool[] {
  return [
    {
      name: 'search_composio_docs',
      description: 'Search the Composio documentation site and return the most relevant matches.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to run against the Composio docs index.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: async ({ query }) => {
        const value = typeof query === 'string' ? query.trim() : '';
        if (!value) {
          throw new Error('query is required');
        }

        const response = await fetch(`/api/search?query=${encodeURIComponent(value)}`);
        if (!response.ok) {
          throw new Error(`search failed with status ${response.status}`);
        }

        return await response.json();
      },
    },
    {
      name: 'open_composio_docs_page',
      description: 'Open a Composio docs page in the current browser tab.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'A same-origin path such as /docs/quickstart or /reference/api-reference.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
      execute: async ({ path }) => {
        const value = typeof path === 'string' ? path.trim() : '';
        if (!value.startsWith('/')) {
          throw new Error('path must be a same-origin absolute path');
        }

        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin) {
          throw new Error('cross-origin navigation is not allowed');
        }

        window.location.assign(url.toString());
        return { ok: true, url: url.toString() };
      },
    },
    {
      name: 'get_composio_tool_schema',
      description: 'Fetch the published input and output schema for a Composio tool slug.',
      inputSchema: {
        type: 'object',
        properties: {
          toolSlug: {
            type: 'string',
            description: 'The Composio tool slug, for example GMAIL_SEND_EMAIL.',
          },
          version: {
            type: 'string',
            description: 'Optional toolkit version. Defaults to latest.',
          },
        },
        required: ['toolSlug'],
        additionalProperties: false,
      },
      execute: async ({ toolSlug, version }) => {
        const slug = typeof toolSlug === 'string' ? toolSlug.trim() : '';
        const toolVersion = typeof version === 'string' && version.trim() ? version.trim() : 'latest';

        if (!slug) {
          throw new Error('toolSlug is required');
        }

        const response = await fetch(
          `/api/tools/${encodeURIComponent(slug)}?version=${encodeURIComponent(toolVersion)}`
        );

        if (!response.ok) {
          throw new Error(`tool schema lookup failed with status ${response.status}`);
        }

        return await response.json();
      },
    },
  ];
}

export function WebMCPProvider() {
  useEffect(() => {
    const provideContext = navigator.modelContext?.provideContext;
    if (typeof provideContext !== 'function') {
      return;
    }

    void Promise.resolve(provideContext({ tools: buildTools() })).catch((error) => {
      console.warn('WebMCP registration failed', error);
    });
  }, []);

  return null;
}
