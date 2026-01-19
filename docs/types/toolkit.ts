export interface Tool {
  slug: string;
  name: string;
  description: string;
}

export interface Trigger {
  slug: string;
  name: string;
  description: string;
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

// Full version with tools and triggers
export interface Toolkit extends ToolkitSummary {
  tools: Tool[];
  triggers: Trigger[];
}
