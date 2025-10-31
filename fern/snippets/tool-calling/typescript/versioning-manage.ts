import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: "YOUR_API_KEY" });

// Get toolkit information including available versions
const toolkit = await composio.toolkits.get("github");

// Extract and print version information
console.log("Toolkit:", toolkit.name);
console.log("Current Version:", toolkit.meta.version);
console.log("Available Versions:", toolkit.meta.availableVersions);
console.log("Latest Version:", toolkit.meta.availableVersions[0]); // First one is usually the latest