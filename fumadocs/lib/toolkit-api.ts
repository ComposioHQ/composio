/**
 * API utilities for fetching toolkit details dynamically
 */

import type { Tool, Trigger, AuthConfigDetail, AuthField, ParametersSchema } from '@/types/toolkit';

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;

if (!API_KEY) {
  console.warn('[toolkit-api] COMPOSIO_API_KEY not set - toolkit details will not be available');
}

export interface ToolkitDetails {
  tools: Tool[];
  triggers: Trigger[];
  authConfigDetails: AuthConfigDetail[];
}

interface RawTool {
  slug?: string;
  name?: string;
  description?: string;
  parameters?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  response?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface RawTrigger {
  slug?: string;
  name?: string;
  description?: string;
  payload?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface RawAuthField {
  name?: string;
  displayName?: string;
  display_name?: string;
  type?: string;
  required?: boolean;
  is_required?: boolean;
}

interface RawAuthConfig {
  name?: string;
  mode?: string;
  fields?: {
    auth_config_creation?: {
      required?: RawAuthField[];
      optional?: RawAuthField[];
    };
    connected_account_initiation?: {
      required?: RawAuthField[];
      optional?: RawAuthField[];
    };
  };
}

function transformSchema(raw: { properties?: Record<string, unknown>; required?: string[] } | undefined): ParametersSchema | undefined {
  if (!raw?.properties || Object.keys(raw.properties).length === 0) {
    return undefined;
  }

  return {
    type: 'object',
    properties: raw.properties as ParametersSchema['properties'],
    required: raw.required,
  };
}

function transformTool(raw: RawTool): Tool {
  return {
    slug: raw.slug || '',
    name: raw.name || raw.slug || '',
    description: raw.description || '',
    inputParameters: transformSchema(raw.parameters),
    outputParameters: transformSchema(raw.response),
  };
}

function transformTrigger(raw: RawTrigger): Trigger {
  return {
    slug: raw.slug || '',
    name: raw.name || raw.slug || '',
    description: raw.description || '',
    payload: transformSchema(raw.payload),
  };
}

function transformAuthField(raw: RawAuthField): AuthField {
  return {
    name: raw.name || '',
    displayName: raw.displayName || raw.display_name || raw.name || '',
    type: raw.type || 'string',
    required: raw.required ?? raw.is_required ?? false,
  };
}

function transformAuthConfig(raw: RawAuthConfig): AuthConfigDetail {
  const transformFields = (fields?: { required?: RawAuthField[]; optional?: RawAuthField[] }) => {
    if (!fields) return undefined;
    return {
      required: (fields.required || []).map(transformAuthField),
      optional: (fields.optional || []).map(transformAuthField),
    };
  };

  return {
    name: raw.name || '',
    mode: raw.mode || '',
    fields: {
      auth_config_creation: transformFields(raw.fields?.auth_config_creation),
      connected_account_initiation: transformFields(raw.fields?.connected_account_initiation),
    },
  };
}

async function fetchTools(toolkitSlug: string): Promise<Tool[]> {
  if (!API_KEY) return [];

  try {
    const response = await fetch(`${API_BASE}/tools?toolkit=${toolkitSlug}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.warn(`[toolkit-api] Failed to fetch tools for ${toolkitSlug}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items = data.items || data || [];
    return items.map(transformTool);
  } catch (error) {
    console.error(`[toolkit-api] Error fetching tools for ${toolkitSlug}:`, error);
    return [];
  }
}

async function fetchTriggers(toolkitSlug: string): Promise<Trigger[]> {
  if (!API_KEY) return [];

  try {
    const response = await fetch(`${API_BASE}/triggers_types?toolkit=${toolkitSlug}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.warn(`[toolkit-api] Failed to fetch triggers for ${toolkitSlug}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items = data.items || data || [];
    return items.map(transformTrigger);
  } catch (error) {
    console.error(`[toolkit-api] Error fetching triggers for ${toolkitSlug}:`, error);
    return [];
  }
}

async function fetchAuthConfigDetails(toolkitSlug: string): Promise<AuthConfigDetail[]> {
  if (!API_KEY) return [];

  try {
    const response = await fetch(`${API_BASE}/toolkits/${toolkitSlug}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.warn(`[toolkit-api] Failed to fetch toolkit details for ${toolkitSlug}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const authConfigs = data.auth_config_details || data.authConfigDetails || [];
    return authConfigs.map(transformAuthConfig);
  } catch (error) {
    console.error(`[toolkit-api] Error fetching auth config for ${toolkitSlug}:`, error);
    return [];
  }
}

/**
 * Fetch detailed toolkit data (tools, triggers, auth config) for a specific toolkit
 */
export async function fetchToolkitDetails(toolkitSlug: string): Promise<ToolkitDetails> {
  // Fetch all data in parallel
  const [tools, triggers, authConfigDetails] = await Promise.all([
    fetchTools(toolkitSlug),
    fetchTriggers(toolkitSlug),
    fetchAuthConfigDetails(toolkitSlug),
  ]);

  return { tools, triggers, authConfigDetails };
}
