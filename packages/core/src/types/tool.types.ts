import { z } from 'zod';

/**
 * Toolkit is the collection of tools,
 * A toolkit can be thought of as an app which provides a set of tools/actions/triggers.
 *
 * eg. Google Toolkit, which provides tools like Google Search, Google Maps, Google Translate, etc.
 */
export const ToolkitSchema = z.object({
  slug: z.string().describe('The slug of the toolkit'),
  name: z.string().describe('The name of the toolkit'),
  logo: z.string().describe('The logo of the toolkit').optional(),
});
export type Toolkit = z.infer<typeof ToolkitSchema>;

/**
 * Tool is a single action that can be performed by a toolkit.
 * Tool is simlar to an action that an app can perform.
 *
 * eg. Google Search, Google Maps, Google Translate, etc.
 */
export const ToolSchema = z.object({
  slug: z.string().describe('The slug of the tool. eg. "GOOGLE_SEARCH"'),
  name: z.string().describe(`The name of the tool. eg. "Google Search"`),
  description: z.string().optional().describe('The description of the tool'),
  inputParameters: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('The input parameters of the tool'),
  outputParameters: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('The output parameters of the tool'),
  tags: z.optional(z.array(z.string())).describe('The tags of the tool. eg: Important').default([]),
  toolkit: z.optional(ToolkitSchema).describe('The toolkit of the tool'),
  version: z.optional(z.string()).describe('The version of the tool, e.g. "1.0.0"'),
});
export type Tool = z.infer<typeof ToolSchema>;

/**
 * ToolListResponse Schema
 */
export const ToolListResponseSchema = z.object({
  items: z.array(ToolSchema),
  nextCursor: z.string().nullable().optional(),
  totalPages: z.number(),
});
export type ToolListResponse = z.infer<typeof ToolListResponseSchema>;

/**
 * Plain SDK level Tool List
 */
export type ToolList = Array<Tool>;

/**
 * ToolListParams is the parameters for the list of tools.
 */
export const ToolListParamsSchema = z.object({
  cursor: z.string().optional(),
  important: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  toolkitSlug: z.string().optional(),
  toolSlugs: z.array(z.string()).optional(),
});
export type ToolListParams = z.infer<typeof ToolListParamsSchema>;

/**
 * CustomAuthParams is the parameters for the custom authentication.
 */
export const CustomAuthParamsSchema = z.object({
  baseURL: z.string().optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  parameters: z.array(
    z.object({
      in: z.enum(['query', 'header']),
      name: z.string(),
      value: z.union([z.string(), z.number()]),
    })
  ),
});
export type CustomAuthParams = z.infer<typeof CustomAuthParamsSchema>;

/**
 * ToolExecuteParams is the parameters for the tool execution.
 */
export const ToolExecuteParamsSchema = z.object({
  allowTracing: z.boolean().optional(),
  connectedAccountId: z.string().optional(),
  customAuthParams: CustomAuthParamsSchema.optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().optional(),
  version: z.string().optional(),
  text: z.string().optional(),
});
export type ToolExecuteParams = z.infer<typeof ToolExecuteParamsSchema>;

/**
 * ToolResponse Schema
 */
export const ToolExecuteResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  error: z.string().nullable(),
  successful: z.boolean(),
  logId: z.string().optional(),
  sessionInfo: z.unknown().optional(),
});
export type ToolExecuteResponse = z.infer<typeof ToolExecuteResponseSchema>;
