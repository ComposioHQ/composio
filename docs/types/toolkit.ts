// Parameter schema for tool inputs/outputs
export interface ParameterSchema {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  example?: unknown;
  enum?: string[];
  // Nested object properties (JSON Schema)
  properties?: Record<string, ParameterSchema>;
  // Required fields within this object
  requiredFields?: string[];
  // Array item schema
  items?: ParameterSchema;
}

export interface Tool {
  slug: string;
  name: string;
  description: string;
  // Detailed fields fetched on-demand
  input_parameters?: Record<string, ParameterSchema>;
  output_parameters?: Record<string, ParameterSchema>;
  scopes?: string[];
  tags?: string[];
  is_deprecated?: boolean;
}

export interface Trigger {
  slug: string;
  name: string;
  description: string;
  // Detailed fields fetched on-demand
  type?: 'webhook' | 'poll';
  config?: Record<string, ParameterSchema>;
  payload?: Record<string, ParameterSchema>;
  instructions?: string;
}

// Auth config field definition
export interface AuthConfigField {
  name: string;
  displayName: string;
  type: string;
  description: string;
  required: boolean;
  default?: string | null;
}

// Auth config details for a specific auth mode
export interface AuthConfigDetail {
  mode: string;
  name: string;
  fields: {
    auth_config_creation: {
      required: AuthConfigField[];
      optional: AuthConfigField[];
    };
    connected_account_initiation: {
      required: AuthConfigField[];
      optional: AuthConfigField[];
    };
  };
}

// Light version for landing page (only fields needed for listing)
export interface ToolkitSummary {
  slug: string;
  name: string;
  logo: string | null;
  category: string | null;
  toolCount: number;
  triggerCount: number;
}

// Full version with tools, triggers, and auth config details
export interface Toolkit extends ToolkitSummary {
  description: string;
  authSchemes: string[];
  version: string | null;
  tools: Tool[];
  triggers: Trigger[];
  authConfigDetails?: AuthConfigDetail[];
}
