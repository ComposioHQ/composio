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

export interface Toolkit {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  category: string | null;
  authSchemes: string[];
  toolCount: number;
  triggerCount: number;
  version: string | null;
  tools: Tool[];
  triggers: Trigger[];
}
