import { Composio } from "@composio/core";

const composio = new Composio({
    apiKey: "YOUR_API_KEY",
    toolkitVersions: {
        github: "20250110_00"  // Default version
    }
});

// Override version for a single execution
const result = await composio.tools.execute({
    toolSlug: "GITHUB_CREATE_ISSUE",
    userId: "user-123",
    arguments: {
        repo: "my-repo",
        title: "Bug report",
        body: "Description here"
    },
    toolkitVersion: "20250115_00"  // Override to different version
});

// This execution uses the SDK default version
const result2 = await composio.tools.execute({
    toolSlug: "GITHUB_LIST_ISSUES",
    userId: "user-123",
    arguments: {
        repo: "my-repo"
    }
});