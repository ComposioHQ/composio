import { Composio } from "@composio/core";

const composio = new Composio()

// Fetch the trigger details
const triggerType = await composio.triggers.getType("GITHUB_STAR_ADDED_EVENT");
console.log(JSON.stringify(triggerType.config, null, 2))
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
    "required": [
      "owner",
      "repo"
    ],
    "title": "WebhookConfigSchema",
    "type": "object"
  }
*/

const userId = "user@acme.com";
// Fetch the connected account for the user
const { items: connections } = await composio.connectedAccounts.list({ 
  userIds: [userId] 
});
// Get the first connected account
const [{ id: connectedAccountId }] = connections;

// Create the trigger
const createResponse = await composio.triggers.create(userId, "GITHUB_STAR_ADDED_EVENT", {
  connectedAccountId,
  triggerConfig: {
    owner: "composiohq",
    repo: "composio",
  },
});


await composio.triggers.subscribe(
    triggerData => {
        console.log('Received trigger:', triggerData);
    },
    {
        // triggerId: 'ti_9q19nLNykmVZ',
        // toolkits: ['GITHUB']
        // userId: "sid",
        // triggerSlug: ["GITHUB_STAR_ADDED_EVENT"]
        authConfigId: "ac_1234567890"
    }
)

await composio.triggers.enable("ti_9q19nLNykmVZ")
await composio.triggers.disable("ti_9q19nLNykmVZ")