import { z } from '@hono/zod-openapi';
import { TelemetryMetricSourceSchema } from './telemetry.types';
import { TelemetryMetricMetadataSchema } from './telemetry.types';

export const TelemetryMetricPayloadSchema = z.object({
  functionName: z.string().describe('The name of the function that was invoked'),
  durationMs: z.number().describe('The duration of the function invocation in milliseconds'),
  timestamp: z.number().describe('The timestamp of the function invocation in epoch milliseconds'),
  props: z.record(z.any()).optional().describe('The properties of the function invocation'),
  source: TelemetryMetricSourceSchema.optional(),
  metadata: TelemetryMetricMetadataSchema.optional(),
  error: z
    .object({
      name: z.string().describe('The name of the error'),
      message: z.string().describe('The message of the error'),
    })
    .optional()
    .describe('The error that occurred during the function invocation'),
});

export type TelemetryMetricSource = z.infer<typeof TelemetryMetricSourceSchema>;
export type TelemetryMetricMetadata = z.infer<typeof TelemetryMetricMetadataSchema>;
export type TelemetryMetricPayload = z.infer<typeof TelemetryMetricPayloadSchema>;

export const TelemetryMetricRequestSchema = z.array(TelemetryMetricPayloadSchema);
export type TelemetryMetricRequest = z.infer<typeof TelemetryMetricRequestSchema>;

//  {
//         metric: 'composio.sdk.function_invocation',
//         type: 'count',
//         points: [[Math.floor(Date.now() / 1000), 1]],
//         tags: [
//           `function:${body.functionName}`,
//           ...(body.error ? ['status:error'] : ['status:success']),
//         ],
//         host: 'composio-sdk',
//       },
export const DDMetricPayloadSchema = z.object({
  metric: z.string().describe('The name of the metric'),
  type: z
    .enum(['count', 'gauge', 'histogram', 'distribution', 'rate'])
    .describe('The type of the metric'),
  points: z.array(z.array(z.number())).describe('The points of the metric'),
  tags: z.array(z.string()).describe('The tags of the metric'),
  host: z.string().describe('The host of the metric'),
});
export type DDMetricPayload = z.infer<typeof DDMetricPayloadSchema>;
