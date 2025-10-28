import { Composio } from "@composio/core";

// Pin specific versions for each toolkit
const composio = new Composio({
    apiKey: "YOUR_API_KEY",
    toolkitVersions: {
        github: "20250116_00",
        slack: "20250115_01",
        gmail: "20250115_00"
    }
});