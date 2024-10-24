
import { Composio } from "composio-core";

const composio = new Composio(process.env.COMPOSIO_API_KEY)

// Get this integrationId from
// app.composio.dev/app/gmail -> setup gmail integration -> 
// Toggle off "use composio app for authentication" -> Click on Save
const gmailIntegrationId =  "662a2010-f980-46f4-a4c4-6c2c8efa0769";

async function setupUserConnectionIfNotExists(entityId) {
    const entity = await composio.getEntity(entityId);
    const integration = await entity.integrations.get({
        integrationId: gmailIntegrationId
    });
    const connections = await composio.connectedAccounts.list({
        integrationId: gmailIntegrationId,
        status: "ACTIVE"
    })
    const connection = connections.items[0];
    if(!connection) {
        const connectionRequest = await entity.initiateConnection(
            "gmail",
            undefined,
            undefined,
            undefined,
            gmailIntegrationId
        );

        // For GMAIL, Bearer token auth mode - specify the token in the fieldInputs
        await connectionRequest.saveUserAccessData({
            fieldInputs: {
                "token": "<Specify the token here>"
            }
        });

        return connectionRequest.waitUntilActive(10);
    }
    return connection;
}

(async() => {
    const entity = composio.getEntity("utkarsh");
    const connection = await setupUserConnectionIfNotExists(entity.id);

    const gmailIntegration = await entity.integrations.get({
        integrationId: gmailIntegrationId
    });

    const gmailAction = await composio.actions.get({
        actionName: "gmail_list_threads"
    });
    console.log("Connection", connection);
    const result = await connection.execute(gmailAction.name, {}, "Hello world");
    console.log("Result", result);
})();

