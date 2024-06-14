
import { LangchainToolSet } from "composio-core";

const TRIGGER_CONFIGS = {
    GITHUB: {
      triggerName: "github_issue_added_event",
      config: {"owner": "ComposioHQ", "repo": "composio"}
    }
};

const toolset = new LangchainToolSet({
    apiKey: process.env.COMPOSIO_API_KEY,
});

async function setupUserConnectionIfNotExists(entityId) {
    const entity = await toolset.client.getEntity(entityId);
    const connection = await entity.getConnection("github");
    if(connection) {
        const connection = await entity.initiateConnection(
            "github",
        );
        return connection.waitUntilActive(60);
    }
    return connection;
}

(async() => {
    const entity = await toolset.client.getEntity("default")
    const connection = await setupUserConnectionIfNotExists(entity.id);

    const activeGithubTriggerForUser = await toolset.client.activeTriggers.list({
        connectedAccountIds: [connection.id],
        triggerNames: ["github_issue_added_event"]
    });
    if(!activeGithubTriggerForUser.triggers.length) {
        const trigger = await entity.setupTrigger("github", TRIGGER_CONFIGS.GITHUB.triggerName, TRIGGER_CONFIGS.GITHUB.config);

        console.log("Trigger", trigger);
    }

})();

