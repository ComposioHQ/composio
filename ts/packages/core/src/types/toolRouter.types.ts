import z from 'zod/v3';

export const ToolRouterToolkitConfigSchema = z.object({
  toolkit: z.string(),
  authConfigId: z.string().optional(),
});

export const ToolRouterConfigSchema = z.object({
  toolkits: z.array(z.union([z.string(), ToolRouterToolkitConfigSchema])).optional(),
  manuallyManageConnections: z.boolean().optional(),
});

export type ToolRouterConfig = z.infer<typeof ToolRouterConfigSchema>;

export const ToolRouterSessionSchema = z.object({
  sessionId: z.string(),
  url: z.string(),
});
export type ToolRouterSession = z.infer<typeof ToolRouterSessionSchema>;
