import { z } from '@hono/zod-openapi';
import { TelemetryMetricMetadataSchema, TelemetryMetricSourceSchema } from './telemetry.types';

export const ErrorLogPayloadSchema = z.object({
  functionName: z.string().describe('The name of the function that was invoked'),
  errorName: z.string().describe('The name of the error').optional(),
  message: z.string().describe('The message of the error').optional(),
  stack: z.string().describe('The stack trace of the error').optional(),
  timestamp: z.number().describe('The timestamp of the error in epoch milliseconds').optional(),
  props: z.record(z.any()).optional().describe('The properties of the error'),
  source: TelemetryMetricSourceSchema.optional(),
  metadata: TelemetryMetricMetadataSchema.optional(),
});
export type ErrorLogPayload = z.infer<typeof ErrorLogPayloadSchema>;
