import { OpenAIToolSet } from "composio-core";

const composioToolset = new OpenAIToolSet();

const integration = await composioToolset.integrations.create({
    name: "gmail_integration",
    appUniqueKey: "gmail",
    forceNewIntegration: true,
    useComposioAuth: false,
    // For useComposioAuth: false, you can provide your own OAuth app credentials here
    // authScheme: "OAUTH2",
    // authConfig: {
    //     clientId: "123456",
    //     clientSecret: "123456"
    // }
})

console.log(integration.id)
