import { Composio } from '@composio/core';

const composio = new Composio();

async function demonstrateRawToolFetching() {
  console.log('=== Raw Composio Tool Fetching Examples ===\n');

  // Example 1: Get a single tool by slug (latest version)
  console.log('1. Getting latest version of HACKERNEWS_GET_USER:');
  const latestTool = await composio.tools.getRawComposioToolBySlug('HACKERNEWS_GET_USER');
  console.log(`Tool: ${latestTool.name} (v${latestTool.version})`);
  console.log(`Available versions: ${latestTool.availableVersions?.join(', ')}\n`);

  // Example 2: Get a specific version of a tool
  console.log('2. Getting specific version of a tool:');
  try {
    const specificVersionTool = await composio.tools.getRawComposioToolBySlug(
      'HACKERNEWS_GET_USER',
      '20250909_00'  // specific version
    );
    console.log(`Tool: ${specificVersionTool.name} (v${specificVersionTool.version})\n`);
  } catch (error) {
    console.log('Note: Specific version may not be available, using latest instead\n');
  }

  // Example 3: Get a tool with schema transformation
  console.log('3. Getting tool with schema transformation:');
  const customizedTool = await composio.tools.getRawComposioToolBySlug(
    'HACKERNEWS_GET_USER',
    'latest',
    {
      modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
        return {
          ...schema,
          description: `Enhanced ${schema.description} - Modified at ${new Date().toISOString()}`,
          customMetadata: {
            toolkit: toolkitSlug,
            modifiedBy: 'versioning-example',
            features: ['enhanced-logging', 'custom-validation']
          }
        };
      }
    }
  );
  console.log(`Modified tool description: ${customizedTool.description}`);
  console.log(`Custom metadata:`, (customizedTool as any).customMetadata);
  console.log();

  // Example 4: Get multiple tools with filters
  console.log('4. Getting multiple tools with filters:');
  const hackerNewsTools = await composio.tools.getRawComposioTools({
    toolkits: ['hackernews'],
    limit: 3
  });
  console.log(`Found ${hackerNewsTools.length} HackerNews tools:`);
  hackerNewsTools.forEach(tool => {
    console.log(`- ${tool.slug}: ${tool.name} (v${tool.version})`);
  });
  console.log();

  // Example 5: Get tools with version control
  console.log('5. Getting tools with version control:');
  const versionedTools = await composio.tools.getRawComposioTools({
    toolkits: ['hackernews'],
    toolkitVersions: 'latest'  // or specify specific versions: { hackernews: '20250909_00' }
  });
  console.log(`Found ${versionedTools.length} versioned tools:`);
  versionedTools.forEach(tool => {
    console.log(`- ${tool.slug} (v${tool.version})`);
  });
  console.log();

  // Example 6: Get tools with schema transformation
  console.log('6. Getting multiple tools with schema transformation:');
  const enhancedTools = await composio.tools.getRawComposioTools({
    toolkits: ['hackernews'],
    limit: 2
  }, {
    modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
      return {
        ...schema,
        tags: [...(schema.tags || []), 'enhanced', 'example'],
        customProperties: {
          lastFetched: new Date().toISOString(),
          exampleUsage: `This tool (${toolSlug}) is from the ${toolkitSlug} toolkit`
        }
      };
    }
  });
  
  console.log('Enhanced tools with custom properties:');
  enhancedTools.forEach(tool => {
    console.log(`- ${tool.slug}:`);
    console.log(`  Tags: ${tool.tags?.join(', ')}`);
    console.log(`  Custom properties:`, (tool as any).customProperties);
  });
  console.log();

  // Example 7: Search for tools
  console.log('7. Searching for tools:');
  try {
    const searchResults = await composio.tools.getRawComposioTools({
      search: 'user'
    });
    console.log(`Found ${searchResults.length} tools matching 'user':`);
    searchResults.slice(0, 3).forEach(tool => {
      console.log(`- ${tool.slug}: ${tool.name}`);
    });
  } catch (error) {
    console.log('Search might require additional parameters');
  }
  console.log();

  // Example 8: Using the wrapped tools (comparison)
  console.log('8. Comparison with wrapped tools:');
  const wrappedTools = await composio.tools.get('default', {
    tools: ['HACKERNEWS_GET_USER']
  });
  console.log('Wrapped tools (provider-specific format):');
  console.log(typeof wrappedTools, Object.keys(wrappedTools));
}

// Run the demonstration
demonstrateRawToolFetching().catch(console.error);
