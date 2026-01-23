// Parameter schema for tool inputs/outputs
export interface ParameterSchema {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  example?: unknown;
  enum?: string[];
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

// Light version for landing page (no tools/triggers arrays)
export interface ToolkitSummary {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  category: string | null;
  authSchemes: string[];
  toolCount: number;
  triggerCount: number;
  version: string | null;
}

// Full version with tools, triggers, and auth config details
export interface Toolkit extends ToolkitSummary {
  tools: Tool[];
  triggers: Trigger[];
  authConfigDetails?: AuthConfigDetail[];
}
