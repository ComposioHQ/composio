# Custom Tools Examples

This directory contains examples demonstrating how to create and use custom tools with Composio SDK.

## Examples

### 1. Simple Custom Tool (`simple.ts`)

Shows how to create a basic standalone tool that doesn't require authentication. The example creates a tool that calculates the square of a number:

```typescript
const tool = await composio.tools.createCustomTool({
  slug: 'CALCULATE_SQUARE',
  name: 'Calculate Square',
  description: 'Calculates the square of a number',
  inputParams: z.object({
    number: z.number().describe('The number to calculate the square of'),
  }),
  execute: async input => {
    const { number } = input;
    return {
      data: { result: number * number },
      error: null,
      successful: true,
    };
  },
});
```

### 2. Toolkit-based Tools (`auth-credentials.ts`)

Demonstrates two approaches to making authenticated requests in toolkit-based tools:

#### Using executeToolRequest (Recommended)

```typescript
const tool = await composio.tools.createCustomTool({
  slug: 'GITHUB_LIST_AND_STAR',
  name: 'List and Star Repository',
  description: 'Lists repositories and stars them',
  toolkitSlug: 'github',
  inputParams: z.object({
    owner: z.string().describe('Repository owner'),
  }),
  execute: async (input, connectionConfig, executeToolRequest) => {
    // executeToolRequest can only call tools from the 'github' toolkit
    // Uses the same connected account credentials automatically
    const listResult = await executeToolRequest({
      slug: 'LIST_REPOSITORIES', // must be a github toolkit tool
      arguments: { owner: input.owner },
    });

    const starResult = await executeToolRequest({
      slug: 'STAR_REPOSITORY', // must be a github toolkit tool
      arguments: {
        owner: input.owner,
        repo: listResult.data.repositories[0].name,
      },
    });

    return {
      data: { listed: listResult.data, starred: starResult.data },
      error: null,
      successful: true,
    };
  },
});
```

#### Using Direct API Calls

```typescript
const tool = await composio.tools.createCustomTool({
  slug: 'GITHUB_STAR_REPO',
  name: 'Star GitHub Repository',
  toolkitSlug: 'github',
  description: 'Stars a GitHub repository using direct API call',
  inputParams: z.object({
    repository: z.string().describe('The repository to star'),
  }),
  execute: async (input, connectionConfig) => {
    // Use connectionConfig for direct API calls or when interacting with different services
    const result = await fetch(
      `https://api.github.com/user/starred/composiohq/${input.repository}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${connectionConfig.val?.access_token}`,
        },
      }
    );
    return {
      data: await result.json(),
      error: null,
      successful: true,
    };
  },
});
```

## Running the Examples

1. Set up your environment:

   ```bash
   cp .env.example .env
   ```

2. Add your Composio API key to `.env`:

   ```
   COMPOSIO_API_KEY=your_api_key_here
   ```

3. Run an example:

   ```bash
   # Run the simple example
   pnpm start:simple

   # Run the auth credentials example
   pnpm start:auth
   ```

## Key Concepts

1. **Standalone vs Toolkit-based Tools**

   - Standalone tools only receive input parameters
   - Toolkit-based tools have access to both `executeToolRequest` and `connectionConfig`

2. **Authentication Methods**

   - `executeToolRequest`: Recommended way to use toolkit tools
     - Can only execute tools from the same toolkit
     - Uses the connected account credentials automatically
     - No need to manage auth tokens
     - Better maintainability and security
   - `connectionConfig`: For direct API calls
     - Use when you need to make direct API calls
     - Use when you need to interact with different services
     - Requires manual token management
     - More flexible but requires more maintenance

3. **Type Safety**

   - Input parameters are validated using Zod schemas
   - TypeScript infers the correct execute function signature based on toolkitSlug

4. **Error Handling**

   - Tools should always return a ToolExecuteResponse
   - Handle errors gracefully and provide meaningful error messages

## Related Examples

- [OpenAI Example](../openai) - Shows integration with OpenAI
- [LangChain Example](../langchain) - Shows integration with LangChain
- [More Examples](../) - Browse all available examples

## Support

- [Documentation](https://docs.composio.dev)
- [Discord Community](https://discord.gg/composio)
- [GitHub Issues](https://github.com/composio/composio/issues)
