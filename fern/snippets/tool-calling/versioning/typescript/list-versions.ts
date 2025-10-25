import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: "YOUR_API_KEY" });

// Get all available versions for a toolkit
const versions = await composio.tools.getToolkitVersions("github");

// Display version information
versions.forEach(version => {
    console.log(`Version: ${version.version}`);
    console.log(`Released: ${version.createdAt}`);
    console.log(`Status: ${version.status}`);
    console.log("-".repeat(40));
});

// Find the latest stable version
const stableVersions = versions.filter(v => v.status === 'stable');
if (stableVersions.length > 0) {
    const latestStable = stableVersions[0];
    console.log(`Latest stable version: ${latestStable.version}`);
}

// Find versions released in the last 7 days
const recentVersions = versions.filter(version => {
    const releaseDate = new Date(version.createdAt);
    const daysAgo = Math.floor((Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysAgo <= 7;
});

console.log(`Versions released in last 7 days: ${recentVersions.length}`);