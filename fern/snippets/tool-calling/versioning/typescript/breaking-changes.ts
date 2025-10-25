import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: "YOUR_API_KEY" });

// ❌ This will fail without version specification (after October 22, 2025)
try {
    const result = await composio.tools.execute({
        toolSlug: "GITHUB_CREATE_ISSUE",
        userId: "user-123",
        arguments: {
            repo: "my-repo",
            title: "Bug report",
            body: "Issue description"
        }
    });
} catch (error) {
    console.error("Error:", error);
    console.log("Manual execution requires toolkit version");
}

// ✅ Solution 1: Specify version in execution
const result1 = await composio.tools.execute({
    toolSlug: "GITHUB_CREATE_ISSUE",
    userId: "user-123",
    arguments: {
        repo: "my-repo",
        title: "Bug report",
        body: "Issue description"
    },
    toolkitVersion: "20250116_00"
});

// ✅ Solution 2: Configure version at SDK level
const composioWithVersion = new Composio({
    apiKey: "YOUR_API_KEY",
    toolkitVersions: { github: "20250116_00" }
});

const result2 = await composioWithVersion.tools.execute({
    toolSlug: "GITHUB_CREATE_ISSUE",
    userId: "user-123",
    arguments: {
        repo: "my-repo",
        title: "Bug report",
        body: "Issue description"
    }
});

// ⚠️ Emergency escape hatch (not recommended for production)
const result3 = await composio.tools.execute({
    toolSlug: "GITHUB_CREATE_ISSUE",
    userId: "user-123",
    arguments: {
        repo: "my-repo",
        title: "Bug report",
        body: "Issue description"
    },
    dangerouslySkipVersionCheck: true
});