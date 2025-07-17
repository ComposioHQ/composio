# Contributing to Composio SDK

Thank you for your interest in contributing to Composio SDK! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Documentation Requirements](#documentation-requirements)
- [Pull Request Process](#pull-request-process)
- [Creating New Providers](#creating-new-providers)
- [Testing Guidelines](#testing-guidelines)
- [Release Process](#release-process)

## Development Setup

### Prerequisites

- Node.js (Latest LTS version recommended)
- [pnpm](https://pnpm.io/) (v10.8.0 or later)
- [bun](https://bun.sh) for productivity (optional)

### Getting Started

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/sdk-v3.git
   cd sdk-v3
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the project:

   ```bash
   pnpm build
   ```

4. Run tests:
   ```bash
   pnpm test
   ```

### Development Commands

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Create a new provider
pnpm create:provider <provider-name> [--agentic]

# Create a new example
pnpm create:example <example-name>

# Check peer dependencies
pnpm check:peer-deps

# Update peer dependencies
pnpm update:peer-deps
```

## Project Structure

```
composio/
├── packages/                  # Main packages directory
│   ├── core/                 # Core SDK package
│   └── providers/            # Provider implementations
├── examples/                 # Example implementations
├── docs/                     # Documentation
├── scripts/                  # Development and build scripts
└── .github/                  # GitHub configuration
```

## Coding Standards

### File Headers

Every source file must include a header comment with:

```typescript
/**
 * @file Description of what this file does/contains
 * @module path/to/module
 * @description Detailed description of the file's purpose
 *
 * @author Original Author <email@example.com>
 * @contributors
 * - Contributor Name <email@example.com>
 *
 * @copyright Composio 2024
 * @license ISC
 *
 * @see {@link https://related.documentation.link}
 * @see {@link https://another.related.link}
 */
```

### Function Documentation

Every user-facing function must include:

1. TSDoc documentation
2. Example usage
3. Parameter and return type descriptions
4. Error cases

Example:

````typescript
/**
 * Executes a tool with the given parameters.
 *
 * @description
 * This function executes a tool with the provided parameters and returns the result.
 * It handles authentication, parameter validation, and error cases automatically.
 *
 * @example
 * ```typescript
 * const result = await executeTool('GMAIL_SEND_EMAIL', {
 *   userId: 'user123',
 *   arguments: {
 *     to: 'recipient@example.com',
 *     subject: 'Hello',
 *     body: 'Message content'
 *   }
 * });
 * ```
 *
 * @param {string} toolId - The unique identifier of the tool to execute
 * @param {ExecuteToolOptions} options - Tool execution options
 * @returns {Promise<ExecuteToolResult>} The result of the tool execution
 *
 * @throws {ToolNotFoundError} When the specified tool doesn't exist
 * @throws {ValidationError} When required parameters are missing
 * @throws {AuthenticationError} When authentication fails
 *
 * @see {@link https://docs.composio.dev/api/tools#execute}
 */
export async function executeTool(
  toolId: string,
  options: ExecuteToolOptions
): Promise<ExecuteToolResult> {
  // Implementation
}
````

### Code Style

1. Use TypeScript for all new code
2. Follow the existing code style in the repository
3. Use ESLint and Prettier for code formatting
4. Use meaningful variable and function names
5. Keep functions small and focused
6. Write unit tests for all new code
7. Use async/await instead of Promises
8. Use named exports instead of default exports
9. Use const assertions for constants
10. Use type assertions sparingly

### Error Handling

1. Use custom error classes
2. Include meaningful error messages
3. Document error cases in TSDoc
4. Include error codes for API errors
5. Log errors appropriately

Example:

```typescript
/**
 * Custom error for tool execution failures.
 */
export class ToolExecutionError extends ComposioError {
  constructor(
    message: string,
    public readonly toolId: string,
    public readonly cause?: Error
  ) {
    super(message, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}
```

## Documentation Requirements

### Package Documentation

Each package must include:

1. README.md with:

   - Package description
   - Installation instructions
   - Usage examples
   - API reference
   - Environment variables
   - Contributing guidelines

2. API documentation:

   - TSDoc for all public APIs
   - Example code snippets
   - Error handling documentation
   - Type definitions

3. Example implementations:
   - Basic usage example
   - Advanced usage examples
   - Integration examples

### Provider Documentation

Provider packages must additionally include:

1. Provider-specific setup instructions
2. Authentication requirements
3. Supported features
4. Limitations and constraints
5. Integration examples
6. Streaming support details
7. Error handling examples

## Pull Request Process

1. Create a new branch for your changes:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the coding standards

3. Add tests for new functionality

4. Update documentation as needed

5. Create a changeset:

   ```bash
   pnpm changeset
   ```

6. Push your changes and create a pull request

7. Wait for review and address any feedback

## Creating New Providers

1. Use the provider creation script:

   ```bash
   pnpm create:provider my-provider [--agentic]
   ```

2. Implement required methods:

   - For non-agentic providers: `wrapTool` and `wrapTools`, and helper functions
   - For agentic providers: `wrapTool`, `wrapTools`, and execution handlers

3. Add comprehensive tests

4. Add provider documentation

5. Create example implementations

## Testing Guidelines

1. Write unit tests for all new code
2. Include integration tests for providers
3. Test error cases
4. Test edge cases
5. Use mocks appropriately
6. Test streaming functionality
7. Test with different Node.js versions

Example test:

```typescript
describe('ToolExecution', () => {
  it('should execute a tool successfully', async () => {
    const result = await executeTool('TEST_TOOL', {
      userId: 'user123',
      arguments: { test: true },
    });
    expect(result.successful).toBe(true);
  });

  it('should handle errors appropriately', async () => {
    await expect(
      executeTool('INVALID_TOOL', {
        userId: 'user123',
        arguments: {},
      })
    ).rejects.toThrow(ToolNotFoundError);
  });
});
```

## Release Process

1. Create a release branch:

   ```bash
   git checkout -b release/v1.2.3
   ```

2. Update version numbers:

   ```bash
   pnpm changeset version
   ```

3. Update CHANGELOG.md

4. Create a release commit:

   ```bash
   git commit -am "Release v1.2.3"
   ```

5. Create a pull request for the release

6. After approval, merge and tag:

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

7. Publish to npm:
   ```bash
   pnpm changeset publish
   ```

## Questions and Support
- Join our [Discord Community](https://discord.com/invite/cNruWaAhQk)
- Check our [Documentation](https://docs.composio.dev)
- File issues on [GitHub](https://github.com/ComposioHQ/sdk-v3/issues)

## License

By contributing to Composio SDK, you agree that your contributions will be licensed under the ISC License.
