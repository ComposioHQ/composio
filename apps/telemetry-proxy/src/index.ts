import telemetry from './routes/v1/telemetry';
import { AppBindings } from './types/app.types';
import { OpenAPIHono } from '@hono/zod-openapi';

const app = new OpenAPIHono<{ Bindings: AppBindings }>();
app.route('/v1', telemetry);
app.doc('/docs', {
  openapi: '3.0.0',
  info: {
    title: 'Composio Telemetry API',
    version: '1.0.0',
  },
});

export default app;
