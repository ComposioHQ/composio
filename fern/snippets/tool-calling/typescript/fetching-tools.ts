import { Composio } from '@composio/core';

const composio = new Composio();
const userId = "uuid-1234-5678-9012";

const tools = await composio.tools.get(userId, {
  toolkits: ["GITHUB"]
});

// Fetch with limit for a specific user
const limitedTools = await composio.tools.get(userId, {
  toolkits: ["GITHUB"],
  limit: 5  // Get top 5 tools
});

// Same filter but without userId (for schemas)
const rawTools = await composio.tools.getRawComposioTools({
  toolkits: ["GITHUB"],
  limit: 5
});

// Fetch specific tools by name
const specificTools = await composio.tools.get(userId, {
  tools: ["GITHUB_LIST_STARGAZERS", "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"]
});

// Get schemas without userId
const specificRawTools = await composio.tools.getRawComposioTools({
  tools: ["GITHUB_LIST_STARGAZERS", "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"]
});

// Filter by OAuth scopes (single toolkit only)
const scopedTools = await composio.tools.get(userId, {
  toolkits: ["GITHUB"],
  scopes: ["write:org"]
});

// Search tools semantically
const searchResults = await composio.tools.get(userId, {
  search: "create google calendar event"
});

// Search schemas without userId
const searchRawTools = await composio.tools.getRawComposioTools({
  search: "create google calendar event"
});

// Search within a specific toolkit
const toolkitSearch = await composio.tools.get(userId, {
  search: "star a repository",
  toolkits: ["GITHUB"]
});

// Search toolkit schemas without userId
const toolkitSearchRaw = await composio.tools.getRawComposioTools({
  search: "star a repository",
  toolkits: ["GITHUB"]
});

const tool = await composio.tools.getRawComposioToolBySlug("GMAIL_SEND_EMAIL");