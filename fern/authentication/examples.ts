import { OpenAIToolSet } from "composio-core";

const composioToolset = new OpenAIToolSet();

const entity = await composioToolset.getEntity("default");

const gmailParams = await composioToolset.apps.getRequiredParamsForAuthScheme({
  appId: "gmail",
  authScheme: "BEARER_TOKEN",
});

console.log(gmailParams.required_fields);

const gmailConnectionReq = await entity.initiateConnection({
  appName: "gmail",
  authMode: "BEARER_TOKEN",
  connectionParams: {
    token: "secret_1234567890",
  },
});

console.log(gmailConnectionReq);
