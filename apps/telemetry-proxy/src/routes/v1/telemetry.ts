import {
  TelemetryMetricPayload,
  TelemetryMetricPayloadSchema,
  TelemetryMetricRequestSchema,
} from '../../types/metrics.types';
import { AppBindings } from '../../types/app.types';
import { sendMetricToDatadog } from '../../lib/metrics';
import { sendErrorLogToDatadog } from '../../lib/errors';
import { ErrorLogPayload, ErrorLogPayloadSchema } from '../../types/errors.types';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

const app = new OpenAPIHono<{ Bindings: AppBindings }>();

const metricsRoute = createRoute({
  method: 'post',
  path: '/metrics/invocations',
  tags: ['telemetry'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: TelemetryMetricRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The success of the request',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    400: {
      description: 'Invalid request body',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
});

const errorsRoute = createRoute({
  method: 'post',
  path: '/errors',
  tags: ['telemetry'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ErrorLogPayloadSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The success of the request',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    400: {
      description: 'Invalid request body',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
});

app.openapi(metricsRoute, async c => {
  try {
    const rawBody = await c.req.json();
    const result = TelemetryMetricRequestSchema.safeParse(rawBody);

    if (!result.success) {
      return c.json({ success: false, error: 'Invalid request body' }, 400);
    }

    const apiKey = c.env.DATADOG_API_KEY as string;
    const res = await sendMetricToDatadog(result.data, apiKey);
    return c.json({ success: res, error: '' }, res ? 200 : 400);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to process request' }, 400);
  }
});

app.openapi(errorsRoute, async c => {
  try {
    const rawBody = await c.req.json();
    const result = ErrorLogPayloadSchema.safeParse(rawBody);

    if (!result.success) {
      return c.json({ success: false, error: 'Invalid request body' }, 400);
    }

    const apiKey = c.env.DATADOG_API_KEY as string;
    const res = await sendErrorLogToDatadog(result.data, apiKey);
    return c.json({ success: res, error: '' }, res ? 200 : 400);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to process request' }, 400);
  }
});

export default app;
