import { z } from 'zod';

export const TelemetryMetricSourceSchema = z.object({
  host: z
    .string()
    .describe('The host of the service running the SDK, eg: mcp, apollo, etc')
    .optional(),
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
  environment: z
    .enum(['development', 'production', 'ci', 'staging', 'test'])
    .describe('The environment of the source, eg: development, production, ci etc')
    .optional(),
});

export const TelemetryMetricMetadataSchema = z.object({
  projectId: z.string().describe('The project ID of the source').optional(),
  provider: z.string().describe('The provider used in the source').optional(),
});

export const TelemetryPayloadSchema = z.object({
  functionName: z.string().describe('The name of the function that was invoked'),
  durationMs: z
    .number()
    .describe('The duration of the function invocation in milliseconds')
    .optional(),
  timestamp: z
    .number()
    .describe('The timestamp of the function invocation in epoch seconds')
    .optional(),
  props: z.record(z.any()).optional().describe('The properties of the function invocation'),
  source: TelemetryMetricSourceSchema.optional(),
  metadata: TelemetryMetricMetadataSchema.optional(),
  error: z
    .object({
      name: z.string().describe('The name of the error'),
      code: z.string().describe('The code of the error').optional(),
      errorId: z
        .string()
        .describe(
          'The unique error ID of the error, this is used to track the error across invocations'
        )
        .optional(),
      message: z.string().describe('The message of the error').optional(),
      stack: z.string().describe('The stack trace of the error').optional(),
    })
    .optional()
    .describe('The error that occurred during the function invocation'),
});

export const TelemetryMetricPayloadBodySchema = z.array(TelemetryPayloadSchema);

export type TelemetryMetricSource = z.infer<typeof TelemetryMetricSourceSchema>;
export type TelemetryMetricMetadata = z.infer<typeof TelemetryMetricMetadataSchema>;
export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;
export type TelemetryMetricPayloadBody = z.infer<typeof TelemetryMetricPayloadBodySchema>;

export const TelemetryRequestBodySchema = z.array(TelemetryPayloadSchema);
export type TelemetryRequestBody = z.infer<typeof TelemetryRequestBodySchema>;
