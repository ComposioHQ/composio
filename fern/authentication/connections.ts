import { OpenAIToolSet } from "composio-core";

const composioToolset = new OpenAIToolSet();

const user_id = "00000000-0000-0000-0000-000000000002";
const integration = await composioToolset.integrations.list({
  appName: "github",
});

enum App {
  AGENCYZOOM = "AGENCYZOOM",
  GMAIL = "GMAIL",
  // Add other apps as needed
}

interface ConnectionParams {
  [key: string]: string;
}

type AuthMode = "API_KEY" | "OAUTH2" | "OAUTH1" | "OAUTH1A" | "BASIC" | "BEARER_TOKEN" | 
  "GOOGLE_SERVICE_ACCOUNT" | "NO_AUTH" | "BASIC_WITH_JWT" | "COMPOSIO_LINK";

// Check if a connection exists for a user and app
async function connectionExists(userId: string, app: App): Promise<boolean> {
  try {
    const entity = await composioToolset.getEntity(userId);
    const connection = await entity.getConnection({ app });
    return connection.status === "ACTIVE";
  } catch (error) {
    // Check if the error is specifically about not finding a connection
    if (error instanceof Error && 
        (error.message?.includes("Could not find a connection") ||
        (error as any)?.errCode === "SDK::NO_CONNECTED_ACCOUNT_FOUND")) {
      console.log(`No active connection found for user ${userId} and app ${app}`);
      return false;
    }
    
    // Log other errors but still return false
    console.error("Error checking connection:", error);
    return false;
  }
}

// Get expected parameters for a connection
async function requestConnectionParams(app: string, authScheme: AuthMode) {
  return await composioToolset.apps.getRequiredParamsForAuthScheme({
    appId: app,
    authScheme: authScheme
  });
}

// Prompt for connection parameters (console version)
function getConnectionValues(connectionParamsInfo: any): ConnectionParams {
  console.log("\nTo connect to this service, you'll need to provide the following authentication details:");
  console.log("=".repeat(80));
  console.log();
  
  const connectionParams: ConnectionParams = {};
  
  // Handle required fields
  if (connectionParamsInfo.required_fields && connectionParamsInfo.required_fields.length > 0) {
    console.log("Required Parameters:");
    for (const paramName of connectionParamsInfo.required_fields) {
      console.log(`Parameter: ${paramName}`);
      console.log("-".repeat(40));
      
      // In browser environment, this would be replaced with form inputs
      const value = prompt(`Enter value for ${paramName}:`);
      if (value) {
        connectionParams[paramName] = value;
      }
      console.log();
    }
  }
  
  // Handle optional fields if needed
  if (connectionParamsInfo.optional_fields && connectionParamsInfo.optional_fields.length > 0) {
    console.log("Optional Parameters:");
    for (const paramName of connectionParamsInfo.optional_fields) {
      console.log(`Parameter: ${paramName}`);
      console.log("-".repeat(40));
      
      const value = prompt(`Enter value for ${paramName} (optional):`);
      if (value) {
        connectionParams[paramName] = value;
      }
      console.log();
    }
  }
  
  return connectionParams;
}

// Initiate a connection with the collected parameters
async function initiateConnection(
  userId: string,
  app: string,
  connectionParams: ConnectionParams,
  authMode: AuthMode,
  redirectUrl?: string
) {
  const entity = await composioToolset.getEntity(userId);
  const connection = await entity.initiateConnection({
    appName: app,
    authMode,
    connectionParams: connectionParams,
  });
  
  return connection;
}

// Main script logic
async function main() {
  const app = App.GMAIL;
  const authMode = "BEARER_TOKEN" as AuthMode;
  
  const exists = await connectionExists(user_id, app);
  
  if (exists) {
    console.log("Connection already exists for this user");
  } else {
    console.log("\nSetting up new connection...");
    const connectionParamsInfo = await requestConnectionParams(app, authMode);
    console.log(connectionParamsInfo);
    
    const connectionParams = getConnectionValues(connectionParamsInfo);
    
    console.log("Connection parameters collected:", connectionParams);
    
    if (Object.keys(connectionParams).length === 0) {
      console.log("No connection parameters provided. Exiting.");
      process.exit(0);
    }
    
    try {
      const connection = await initiateConnection(
        user_id,
        app,
        connectionParams,
        authMode,
      );
      console.log("Connection established successfully:");
      console.log(JSON.stringify(connection, null, 4));
    } catch (error) {
      console.error("Failed to establish connection:", error);
    }
  }
}

// Uncomment to run the script
main().catch(console.error);

