export interface SchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  required?: boolean;
  enum?: unknown[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

export interface ParametersSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

export interface Tool {
  slug: string;
  name: string;
  description: string;
  inputParameters?: ParametersSchema;
  outputParameters?: ParametersSchema;
}

export interface Trigger {
  slug: string;
  name: string;
  description: string;
  payload?: ParametersSchema;
}

export interface AuthField {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
}

export interface AuthConfigDetail {
  name: string;
  mode: string;
  fields: {
    auth_config_creation?: {
      required: AuthField[];
      optional: AuthField[];
    };
    connected_account_initiation?: {
      required: AuthField[];
      optional: AuthField[];
    };
  };
}

export interface Toolkit {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  category: string | null;
  authSchemes: string[];
  authConfigDetails: AuthConfigDetail[];
  toolCount: number;
  triggerCount: number;
  version: string | null;
  tools: Tool[];
  triggers: Trigger[];
}
