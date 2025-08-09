/**
 * @fileoverview MCP-specific error classes for Composio SDK
 *
 * @module errors/McpErrors
 */

import { ComposioError, ComposioErrorOptions } from './ComposioError';

/**
 * Error codes for MCP operations
 */
export const MCP_ERROR_CODES = {
  INVALID_INPUT: 'MCP_INVALID_INPUT',
  SERVER_EXISTS: 'MCP_SERVER_EXISTS',
  SERVER_NOT_FOUND: 'MCP_SERVER_NOT_FOUND',
  OPERATION_FAILED: 'MCP_OPERATION_FAILED',
  PARSING_FAILED: 'MCP_PARSING_FAILED',
  CONFIG_NOT_FOUND: 'MCP_CONFIG_NOT_FOUND',
  UNAUTHORIZED: 'MCP_UNAUTHORIZED',
} as const;

/**
 * Base class for all MCP errors
 */
abstract class BaseMcpError extends ComposioError {
  constructor(message: string, options: ComposioErrorOptions = {}) {
    super(message, options);
    this.name = 'McpError';
  }
}

/**
 * Thrown when invalid input is provided to MCP operations
 *
 * @example
 * ```typescript
 * import { McpInvalidInputError } from '@composio/core';
 *
 * try {
 *   await composio.mcp.create('', []);
 * } catch (error) {
 *   if (error instanceof McpInvalidInputError) {
 *     console.log('Invalid input provided');
 *   }
 * }
 * ```
 */
export class McpInvalidInputError extends BaseMcpError {
  constructor(message: string = 'Invalid input provided', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: MCP_ERROR_CODES.INVALID_INPUT,
    });
    this.name = 'McpInvalidInputError';
  }
}

/**
 * Thrown when attempting to create a server that already exists
 *
 * @example
 * ```typescript
 * import { McpServerExistsError } from '@composio/core';
 *
 * try {
 *   await composio.mcp.create('existing-server', configs);
 * } catch (error) {
 *   if (error instanceof McpServerExistsError) {
 *     console.log('Server already exists');
 *   }
 * }
 * ```
 */
export class McpServerExistsError extends BaseMcpError {
  constructor(message: string = 'Server already exists', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: MCP_ERROR_CODES.SERVER_EXISTS,
    });
    this.name = 'McpServerExistsError';
  }
}

/**
 * Thrown when a requested server is not found
 *
 * @example
 * ```typescript
 * import { McpServerNotFoundError } from '@composio/core';
 *
 * try {
 *   await composio.mcp.get('non-existent-server');
 * } catch (error) {
 *   if (error instanceof McpServerNotFoundError) {
 *     console.log('Server not found');
 *   }
 * }
 * ```
 */
export class McpServerNotFoundError extends BaseMcpError {
  constructor(message: string = 'Server not found', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: MCP_ERROR_CODES.SERVER_NOT_FOUND,
    });
    this.name = 'McpServerNotFoundError';
  }
}

/**
 * Thrown when an MCP operation fails
 *
 * @example
 * ```typescript
 * import { McpOperationFailedError } from '@composio/core';
 *
 * try {
 *   await composio.mcp.create('server-name', configs);
 * } catch (error) {
 *   if (error instanceof McpOperationFailedError) {
 *     console.log('Operation failed:', error.message);
 *   }
 * }
 * ```
 */
export class McpOperationFailedError extends BaseMcpError {
  constructor(message: string = 'Operation failed', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: MCP_ERROR_CODES.OPERATION_FAILED,
    });
    this.name = 'McpOperationFailedError';
  }
}

/**
 * Thrown when response parsing fails
 *
 * @example
 * ```typescript
 * import { McpParsingFailedError } from '@composio/core';
 *
 * try {
 *   await composio.mcp.list();
 * } catch (error) {
 *   if (error instanceof McpParsingFailedError) {
 *     console.log('Failed to parse response');
 *   }
 * }
 * ```
 */
export class McpParsingFailedError extends BaseMcpError {
  constructor(message: string = 'Response parsing failed', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: MCP_ERROR_CODES.PARSING_FAILED,
    });
    this.name = 'McpParsingFailedError';
  }
}

/**
 * Thrown when a configuration is not found
 *
 * @example
 * ```typescript
 * import { McpConfigNotFoundError } from '@composio/core';
 *
 * try {
 *   await composio.mcp.getConnectionParams('server-id', 'toolkit');
 * } catch (error) {
 *   if (error instanceof McpConfigNotFoundError) {
 *     console.log('Configuration not found');
 *   }
 * }
 * ```
 */
export class McpConfigNotFoundError extends BaseMcpError {
  constructor(message: string = 'Configuration not found', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: MCP_ERROR_CODES.CONFIG_NOT_FOUND,
    });
    this.name = 'McpConfigNotFoundError';
  }
}

/**
 * Thrown when unauthorized access is attempted
 *
 * @example
 * ```typescript
 * import { McpUnauthorizedError } from '@composio/core';
 *
 * try {
 *   await composio.mcp.delete('server-id');
 * } catch (error) {
 *   if (error instanceof McpUnauthorizedError) {
 *     console.log('Unauthorized access');
 *   }
 * }
 * ```
 */
export class McpUnauthorizedError extends BaseMcpError {
  constructor(message: string = 'Unauthorized access', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: MCP_ERROR_CODES.UNAUTHORIZED,
    });
    this.name = 'McpUnauthorizedError';
  }
}

/**
 * Union type of all MCP error classes for type checking
 */
export type McpError =
  | McpInvalidInputError
  | McpServerExistsError
  | McpServerNotFoundError
  | McpOperationFailedError
  | McpParsingFailedError
  | McpConfigNotFoundError
  | McpUnauthorizedError;
