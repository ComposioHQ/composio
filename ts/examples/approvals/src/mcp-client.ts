import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { type AskUser } from './approval';

export function createApprovalClient(askUser?: AskUser) {
  const client = new Client(
    { name: 'composio-approvals-example', version: '1.0.0' },
    { capabilities: askUser ? { elicitation: { form: {} } } : {} }
  );
  if (askUser) {
    client.setRequestHandler(ElicitRequestSchema, async request => {
      if (request.params.mode === 'url')
        throw new Error('This example supports form elicitation only');
      return askUser({
        type: 'elicitation',
        mode: 'form',
        message: request.params.message,
        requestedSchema: request.params.requestedSchema,
      });
    });
  }
  return client;
}
