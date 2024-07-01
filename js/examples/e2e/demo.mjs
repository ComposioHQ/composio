
import { Composio } from "composio-core";

const TRIGGER_CONFIGS = {
    GITHUB: {
      triggerName: "github_issue_added_event",
      config: {"owner": "ComposioHQ", "repo": "composio"}
    }
};

const composio = new Composio(process.env.COMPOSIO_API_KEY)

async function setupUserConnectionIfNotExists(entityId) {
    const entity = await composio.getEntity(entityId);
    const connection = await entity.getConnection("googlecalendar");
    if(!connection) {
        const connection = await entity.initiateConnection(
            "googlecalendar",
        );

        console.log("> Please go to the following link and authorize Composio to access your Google Calendar:", connection.redirectUrl);
        return connection.waitUntilActive(60);
    }
    return connection;
}

(async() => {
    const allActions =  await composio.actions.list();
    console.log(
        `We have around ${allActions.length} actions available, 
but we can't pass all of them to our agent. 
So we are going to filter them down`
    );
    
    const entity = composio.getEntity("default");
    const relevantActions = await composio.actions.list({
        apps: ["googlecalendar"],
        useCase: "Book a meeting"
    })
    await setupUserConnectionIfNotExists(entity.id);
    const calendarAction = relevantActions.items.find(action => action.name === "googlecalendar_quick_add_google_calendar")
    console.log("Calendar action", calendarAction);

    const result = await entity.execute(calendarAction.name, {}, "Book a meeting for 60 minutes with GUEST = hudixt@gmail.com wih DESCRIPTION = 'Test meeting'");
    console.log("Result", result);
})();

