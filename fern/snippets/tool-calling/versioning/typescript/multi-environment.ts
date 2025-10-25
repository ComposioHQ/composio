import { Composio } from "@composio/core";

// Get current environment from environment variable
const env = process.env.ENVIRONMENT || "development";

// Define version configurations for each environment
const versionConfigs = {
    development: {
        github: "latest",
        slack: "latest",
        gmail: "latest"
    },
    staging: {
        github: "20250116_00",  // Test new GitHub version
        slack: "20250110_00",   // Keep stable Slack version
        gmail: "20250110_00"
    },
    production: {
        github: "20250110_00",  // Stable, tested version
        slack: "20250110_00",   // Stable, tested version
        gmail: "20250109_00"    // Stable, tested version
    }
};

// Initialize Composio with environment-specific versions
const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY!,
    toolkitVersions: versionConfigs[env as keyof typeof versionConfigs]
});

console.log(`Environment: ${env}`);
console.log(`Toolkit versions:`, versionConfigs[env as keyof typeof versionConfigs]);