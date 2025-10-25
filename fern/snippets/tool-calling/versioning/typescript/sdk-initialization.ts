import { Composio } from "@composio/core";

// Initialize SDK with specific toolkit versions
const composio = new Composio({
    apiKey: "YOUR_API_KEY",
    toolkitVersions: {
        github: "20250116_00",
        slack: "20250115_01",
        gmail: "latest"  // Use latest version for development
    }
});

// Fetch tools - they will use the specified versions
const tools = await composio.tools.get("user-123", {
    toolkits: ["github", "slack"]
});

// Execute a tool - inherits version from SDK initialization
const result = await composio.tools.execute({
    toolSlug: "GITHUB_CREATE_ISSUE",
    userId: "user-123",
    arguments: {
        repo: "my-repo",
        owner: "my-org",
        title: "Bug report",
        body: "Issue description"
    }
});