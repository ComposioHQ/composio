import { Composio } from "@composio/core";

const composio = new Composio({
    apiKey: "YOUR_API_KEY",
    toolkitVersions: { github: "20250116_00" }
});

// List available versions for a toolkit
const versions = await composio.tools.getToolkitVersions("github");
versions.slice(0, 3).forEach(version => {
    console.log(`Version: ${version.version} - Status: ${version.status}`);
});

// Fetch tools and inspect their versions
const tools = await composio.tools.get("user-123", {
    toolkits: ["github"]
});
tools.slice(0, 3).forEach(tool => {
    console.log(`${tool.slug}: v${tool.toolkitVersion}`);
});