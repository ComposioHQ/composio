import { OpenAIToolSet } from "composio-core";
const composioToolset = new OpenAIToolSet();

async function hasIntegration(app: string) {
  const integrations = await composioToolset.integrations.list({
    appName: app,
  });
  return integrations.items.length > 0;
}

// console.log(await hasIntegration("asana"));

const expectedParams =
  await composioToolset.apps.getRequiredParamsForAuthScheme({
    appId: "asana",
    authScheme: "OAUTH2",
  });

console.log("Required fields:", expectedParams.expected_from_user);
console.log("Optional fields:", expectedParams.optional_fields);

const integration = await composioToolset.integrations.create({
  appUniqueKey: "googlecalendar",
  name: "Google Calendar",
  authScheme: "OAUTH2",
  useComposioAuth: false,
  authConfig: {
    client_id: "12345678",
    client_secret: "12345678",
    redirect_uri: "https://yourapp.com/redirect",
  },
});

console.log(integration);

const entity = await composioToolset.getEntity("default");

const connectionRequest = await entity.initiateConnection({
  integrationId: integration.id,
  redirectUri: "https://yourapp.com/redirect",
});

console.log(connectionRequest.redirectUrl);

