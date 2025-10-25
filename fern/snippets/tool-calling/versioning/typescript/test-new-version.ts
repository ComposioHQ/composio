import { Composio } from "@composio/core";

async function testNewGithubVersion(): Promise<boolean> {
    // Initialize with new version to test
    const testComposio = new Composio({
        apiKey: "YOUR_TEST_KEY",
        toolkitVersions: { github: "20250116_00" }
    });
    
    // Test basic tool execution
    const result = await testComposio.tools.execute({
        toolSlug: "GITHUB_CREATE_ISSUE",
        userId: "test-user",
        arguments: {
            repo: "test-repo",
            owner: "test-org",
            title: "Test issue",
            body: "Testing new version"
        }
    });
    
    if (!result.successful) {
        throw new Error("Tool execution failed");
    }
    
    if (!result.data.issue_number) {
        throw new Error("Missing expected data in response");
    }
    
    // Test tool fetching
    const tools = await testComposio.tools.get("test-user", {
        toolkits: ["github"]
    });
    
    if (tools.length === 0) {
        throw new Error("No tools returned");
    }
    
    if (!tools.every(tool => tool.toolkit === "github")) {
        throw new Error("Unexpected toolkit in results");
    }
    
    console.log("✓ New version tests passed");
    return true;
}

async function testVersionCompatibility(): Promise<void> {
    const oldVersion = "20250110_00";
    const newVersion = "20250116_00";
    
    // Initialize with old version
    const oldComposio = new Composio({
        apiKey: "YOUR_TEST_KEY",
        toolkitVersions: { github: oldVersion }
    });
    
    // Initialize with new version
    const newComposio = new Composio({
        apiKey: "YOUR_TEST_KEY",
        toolkitVersions: { github: newVersion }
    });
    
    // Get tools from both versions
    const oldTools = await oldComposio.tools.get("test-user", {
        toolkits: ["github"]
    });
    
    const newTools = await newComposio.tools.get("test-user", {
        toolkits: ["github"]
    });
    
    // Check that essential tools still exist
    const oldToolSlugs = new Set(oldTools.map(tool => tool.slug));
    const newToolSlugs = new Set(newTools.map(tool => tool.slug));
    
    const essentialTools = [
        "GITHUB_CREATE_ISSUE",
        "GITHUB_CREATE_PULL_REQUEST",
        "GITHUB_LIST_ISSUES"
    ];
    
    for (const tool of essentialTools) {
        if (!newToolSlugs.has(tool)) {
            throw new Error(`Essential tool ${tool} missing in new version`);
        }
    }
    
    console.log("✓ Backward compatibility verified");
}