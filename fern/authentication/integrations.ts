import { OpenAIToolSet } from "composio-core";
const composioToolset = new OpenAIToolSet();

const userId = "00000000-0000-0000-0000-000000000002";
const integrations = await composioToolset.integrations.list({
  appName: "github",
});

interface AuthConfig {
  clientId?: string;
  clientSecret?: string;
  [key: string]: any;
}

async function hasActiveConnection(userId: string, app: string) {
  try {
    const entity = await composioToolset.getEntity(userId);
    const connection = await entity.getConnection({ app });
    if (connection.status === "ACTIVE") {
      console.log(`Connection already exists for user ${userId}`);
      return true;
    }
    return false;
  } catch (error) {
    // Check if the error is about not finding a connection
    if (error instanceof Error && 
        error.message?.includes("Could not find a connection") ||
        (error as any)?.errCode === "SDK::NO_CONNECTED_ACCOUNT_FOUND") {
      return false;
    }
    // Re-throw other errors
    throw error;
  }
}

const isConnected = await hasActiveConnection(userId, "github");
if (isConnected) {
  console.log("Connection already exists for this user");
} else {
  console.log("\nSetting up new connection...");
}

async function requestConnectionParams(app: string, authScheme: string) {
  const connectionParams = await composioToolset.apps.getRequiredParamsForAuthScheme({
    appId: app,
    authScheme: authScheme,
  });
  return connectionParams;
}

const connectionParams = await requestConnectionParams("gmail", "BEARER_TOKEN");
console.log(connectionParams);

process.exit(0);

async function createIntegrationIfNotExists(
  app: string,
  name: string,
  authScheme:
    | "OAUTH2"
    | "OAUTH1"
    | "OAUTH1A"
    | "API_KEY"
    | "BASIC"
    | "BEARER_TOKEN"
    | "GOOGLE_SERVICE_ACCOUNT"
    | "NO_AUTH"
    | "BASIC_WITH_JWT"
    | "COMPOSIO_LINK",
  authConfig: AuthConfig,
  useComposioAuth: boolean = false
) {
  try {
    // Get existing integrations for the app
    const integrations = await composioToolset.integrations.list({
      appName: app,
    });
    // Return first existing integration if found
    if (
      integrations &&
      Array.isArray(integrations) &&
      integrations.length > 0
    ) {
      return integrations[0];
    }

    // Create new integration if none exists
    const integration = await composioToolset.integrations.create({
      name: name,
      appUniqueKey: app,
      authScheme: authScheme,
      authConfig: authConfig,
      useComposioAuth: useComposioAuth,
    });
    return integration;
  } catch (error) {
    console.error("Error creating/getting integration:", error);
    throw error;
  }
}

const integration = await createIntegrationIfNotExists("github", "github-ts", "OAUTH2", {
  client_id: "1234567890",
  client_secret: "1234567890",
});

console.log(integration);

const app = composioToolset.apps.get({ appKey: "github" });

const reqParams = await composioToolset.apps.getRequiredParamsForAuthScheme({
  appId: "firecrawl",
  authScheme: "API_KEY",
});

console.log(reqParams);
