import { Composio } from "@composio/core";

// Pin specific versions for each toolkit
const composio = new Composio({
    apiKey: "YOUR_API_KEY",
    toolkitVersions: {
        github: "20251027_00",
        slack: "20251027_00",
        gmail: "20251027_00"
    }
});