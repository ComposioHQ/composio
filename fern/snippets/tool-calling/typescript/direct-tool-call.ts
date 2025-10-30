import { Composio } from "@composio/core";

const userId = "user-k7334";
// Configure toolkit versions at SDK level
const composio = new Composio({
    apiKey: "your_composio_key",
    toolkitVersions: { github: "20251027_00" }
});

// Find available arguments for any tool in the Composio dashboard
const result = await composio.tools.execute("GITHUB_LIST_STARGAZERS", {
  userId,
  arguments: {
    "owner": "ComposioHQ", 
    "repo": "composio", 
    "page": 1, 
    "per_page": 5
  },
});
console.log('GitHub stargazers:', JSON.stringify(result, null, 2));