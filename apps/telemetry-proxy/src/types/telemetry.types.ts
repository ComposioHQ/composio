import { z } from '@hono/zod-openapi';

export const TelemetryMetricSourceSchema = z.object({
  name: z.string().describe('The name of the source').optional(),
  service: z
    .enum(['sdk', 'apollo', 'hermes', 'thermos'])
    .describe('The service of the source')
    .optional(),
  language: z
    .enum(['python', 'typescript', 'go', 'rust'])
    .describe('The language of the function that was invoked')
    .optional(),
  version: z.string().describe('The version of the source').optional(),
  platform: z.string().describe('The platform of the source').optional(),
});

export const TelemetryMetricMetadataSchema = z.object({
  projectId: z.string().describe('The project ID of the source').optional(),
  provider: z.string().describe('The provider used in the source').optional(),
});
