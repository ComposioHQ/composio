import { Composio } from '@composio/core';

const composio = new Composio();

const userId = 'user@acme.com';
// Fetch the trigger details
const triggerType = await composio.triggers.getType('GITHUB_COMMIT_EVENT');
console.log(JSON.stringify(triggerType.config, null, 2));
/*--- Trigger config ---
{
  "properties": {
    "owner": {
      "description": "Owner of the repository",
      "title": "Owner",
      "type": "string"
    },
    "repo": {
      "description": "Repository name",
      "title": "Repo",
      "type": "string"
    }
  },
  "required": ["owner", "repo"],
  "title": "WebhookConfigSchema",
  "type": "object"
}
*/

const createResponse = await composio.triggers.create(userId, 'GITHUB_COMMIT_EVENT', {
  triggerConfig: {
    owner: 'composiohq',
    repo: 'composio',
  },
});
console.log(createResponse);