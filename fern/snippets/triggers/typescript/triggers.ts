import { Composio } from "@composio/core";

const composio = new Composio()

composio.triggers.getType("GITHUB_STAR_ADDED_EVENT").then(triggerType => {
    console.log(JSON.stringify(triggerType.config, null, 2))
})
// {
//     "properties": {
//       "owner": {
//         "description": "Owner of the repository",
//         "title": "Owner",
//         "type": "string"
//       },
//       "repo": {
//         "description": "Repository name",
//         "title": "Repo",
//         "type": "string"
//       }
//     },
//     "required": [
//       "owner",
//       "repo"
//     ],
//     "title": "WebhookConfigSchema",
//     "type": "object"
//   }

const userId = "user@acme.com";
const { items: connections } = await composio.connectedAccounts.list({ userIds: [userId] });
const [{ id: connectedAccountId }] = connections;
console.log(connectedAccountId);
const createResponse = await composio.triggers.create("GITHUB_STAR_ADDED_EVENT", {
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