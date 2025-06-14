import { Composio } from "@composio/core";

const composio = new Composio()



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