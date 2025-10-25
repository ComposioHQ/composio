import { Composio } from "@composio/core";

// Set environment variables before running your application
// export COMPOSIO_TOOLKIT_VERSION_GITHUB="20250116_00"
// export COMPOSIO_TOOLKIT_VERSION_SLACK="20250115_01"

// Or set a global version for all toolkits
// export COMPOSIO_TOOLKIT_VERSION="20250116_00"

// SDK automatically reads environment variables
const composio = new Composio({
    apiKey: "YOUR_API_KEY"
});

// Tools will use versions from environment variables
const tools = await composio.tools.get("user-123", {
    toolkits: ["github", "slack"]
});

// Check which versions are being used
tools.forEach(tool => {
    console.log(`Tool: ${tool.slug}, Version: ${tool.toolkitVersion}`);
});