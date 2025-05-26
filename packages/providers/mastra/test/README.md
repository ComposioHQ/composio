# Mastra Provider Tests

This directory contains comprehensive unit tests for the Mastra provider implementation.

## Test Coverage

The test suite covers the following areas:

### 1. Provider Properties

- **Name verification**: Ensures the provider has the correct name "mastra"
- **Agentic nature**: Confirms the provider is marked as agentic (supports tool execution)

### 2. Tool Wrapping (`wrapTool`)

- **Basic wrapping**: Tests conversion of Composio tools to Mastra createTool format
- **Schema handling**: Tests proper conversion of input/output parameters using jsonSchemaToModel
- **Edge cases**: Handles tools without descriptions, input parameters, or output parameters
- **Execution context**: Tests different context parameter scenarios (empty, missing, populated)

### 3. Tools Collection (`wrapTools`)

- **Multiple tools**: Tests wrapping arrays of tools into key-value collections
- **Empty arrays**: Handles empty tool arrays gracefully
- **Key mapping**: Uses tool slugs as collection keys
- **Duplicate handling**: Manages duplicate tool slugs by overwriting

### 4. Tool Execution (`executeTool`)

- **Global execution**: Tests integration with the global tool execution function
- **Modifiers support**: Tests passing of beforeExecute/afterExecute modifiers
- **Error handling**: Tests graceful handling of execution errors

### 5. Mastra Integration

- **Compatibility**: Ensures generated tools are compatible with Mastra's createTool function
- **Type safety**: Validates correct typing for MastraTool and MastraToolCollection
- **Schema mapping**: Tests proper mapping from Composio tool schemas to Mastra schemas

### 6. Error Handling

- **Execution failures**: Tests behavior when tool execution fails
- **Malformed schemas**: Handles tools with null or malformed schema definitions
- **Type safety**: Maintains type safety even with edge cases

## Test Structure

The tests follow vitest conventions and include:

- Comprehensive mocking of `@mastra/core` and `@composio/core`
- Setup and teardown with `beforeEach` for clean test isolation
- Detailed assertions for both successful and error scenarios
- Type-safe test implementations

## Running Tests

```bash
# From the mastra provider directory
npm test

# From the workspace root
pnpm test --filter=@composio/mastra
```

## Mock Strategy

The tests use vi.mock() to mock:

- `@mastra/core` - Specifically the `createTool` function
- `@composio/core` - The `jsonSchemaToModel` function

This ensures tests are isolated and don't depend on external dependencies while validating the integration contracts.
