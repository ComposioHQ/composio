import { OpenAIToolSet } from "composio-core";

const toolset = new OpenAIToolSet();
const userId = "your_user_unique_id";
const googleIntegrationId = "0000-0000";

console.log(`Initiating OAuth connection for entity ${userId}...`);
const connectionRequest = await toolset.connectedAccounts.initiate({
    integrationId: googleIntegrationId,
    entityId: userId,
    // Optionally add: redirectUri: "https://yourapp.com/final-destination"
    // if you want user sent somewhere specific *after* Composio finishes.
});

// Check if a redirect URL was provided (expected for OAuth)
if (connectionRequest?.redirectUrl) {
    console.log(`Received redirect URL: ${connectionRequest.redirectUrl}`);
    // Proceed to Step 2: Redirect the user
    // Return or pass connectionRequest to the next stage
} else {
    console.error("Error: Expected a redirectUrl for OAuth flow but didn't receive one.");
}
