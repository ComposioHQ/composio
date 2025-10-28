import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: "YOUR_API_KEY" });

// Specify version directly in execute call
const result = await composio.tools.execute({
    toolSlug: "GITHUB_CREATE_ISSUE",
    userId: "user-123",
    arguments: {
        repo: "my-repo",
        title: "Critical fix"
    },
    toolkitVersion: "20250116_00"  // Version for this execution
});