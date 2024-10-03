import { Hono } from 'hono';
import { AIHelper } from './AIHelper';
import {CloudflareToolSet} from 'composio-core';

const app = new Hono();

app.post('/help', async (c) => {
	try {
	  const id = c.env.AI_HELPER.idFromName('ai-helper');
	  const obj = c.env.AI_HELPER.get(id);
  
	  const body = await c.req.json();
	  body.entityId = 'default'; // Add this if not provided in the original request
  
	  const response = await obj.fetch(c.req.url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	  });
  
	  const data = await response.json();
	  return c.json(data);
	} catch (err) {
	  console.error('Error:', err);
	  return c.text('Something went wrong', 500);
	}
  });

export default app;
export { AIHelper };