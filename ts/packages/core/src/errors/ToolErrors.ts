import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ToolErrorCodes = {
  TOOLSET_NOT_DEFINED: 'TOOLSET_NOT_DEFINED',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INVALID_MODIFIER: 'INVALID_MODIFIER',
  CUSTOM_TOOLS_NOT_INITIALIZED: 'CUSTOM_TOOLS_NOT_INITIALIZED',
  TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
  INVALID_EXECUTE_FUNCTION: 'INVALID_EXECUTE_FUNCTION',
  GLOBAL_EXECUTE_TOOL_FN_NOT_SET: 'GLOBAL_EXECUTE_TOOL_FN_NOT_SET',
  TOOL_VERSION_REQUIRED: 'TOOL_VERSION_REQUIRED',
} as const;

export class ComposioProviderNotDefinedError extends ComposioError {
  constructor(
    message: string = 'Provider not defined',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolErrorCodes.TOOLSET_NOT_DEFINED,
      possibleFixes: options.possibleFixes || [
        'Ensure that the provider is defined in the Composio project and passed into the tool instance',
      ],
    });
    this.name = 'ComposioProviderNotDefinedError';
  }
}

export class ComposioToolNotFoundError extends ComposioError {
  constructor(
    message: string = 'Tool not found',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolErrorCodes.TOOL_NOT_FOUND,
      possibleFixes: options.possibleFixes || [
        'Ensure the tool slug is correct and exists in the Composio project',
      ],
    });
    this.name = 'ComposioToolNotFoundError';
  }
}

export class ComposioInvalidModifierError extends ComposioError {
  constructor(
    message: string = 'Invalid modifier',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolErrorCodes.INVALID_MODIFIER,
      possibleFixes: options.possibleFixes || [
        'Ensure the modifier is a function and returns a valid result',
      ],
    });
    this.name = 'ComposioInvalidModifierError';
  }
}

export class ComposioCustomToolsNotInitializedError extends ComposioError {
  constructor(
    message: string = 'Custom tools not initialized',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolErrorCodes.CUSTOM_TOOLS_NOT_INITIALIZED,
      possibleFixes: options.possibleFixes || [
        'Ensure the custom tools class is initialized in the Tools instance',
      ],
    });
    this.name = 'ComposioCustomToolsNotInitializedError';
  }
}

export class ComposioToolExecutionError extends ComposioError {
  public readonly error: Error;
  constructor(
    message: string = 'Tool execution error',
    options: ComposioErrorOptions & { originalError?: Error } = {}
  ) {
    const { originalError, ...restOptions } = options;

    super(message, {
      ...restOptions,
      code: options.code || ToolErrorCodes.TOOL_EXECUTION_ERROR,
      cause: options.cause || originalError,
      possibleFixes: options.possibleFixes || [
        'Ensure the tool is correctly configured and the input is valid',
      ],
    });

    this.error =
      originalError ||
      (options.cause instanceof Error
        ? options.cause
        : options.cause
          ? new Error(String(options.cause))
          : new Error('Unknown error'));

    this.name = 'ComposioToolExecutionError';
  }
}

export class ComposioInvalidExecuteFunctionError extends ComposioError {
  constructor(
    message: string = 'Invalid execute function',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolErrorCodes.INVALID_EXECUTE_FUNCTION,
      possibleFixes: options.possibleFixes || [
        'Ensure the execute function is a valid function and returns a valid result',
      ],
    });
    this.name = 'ComposioInvalidExecuteFunctionError';
  }
}

export class ComposioGlobalExecuteToolFnNotSetError extends ComposioError {
  constructor(
    message: string = 'Global execute tool function not set',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolErrorCodes.GLOBAL_EXECUTE_TOOL_FN_NOT_SET,
      possibleFixes: options.possibleFixes || [
        'Ensure the global execute tool function is set in the provider',
      ],
    });
    this.name = 'ComposioGlobalExecuteToolFnNotSetError';
  }
}

/**
 * Error thrown when toolkit version is not specified for manual tool execution.
 *
 * This error is thrown when attempting to execute a tool manually (via `tools.execute()`)
 * and the resolved version is "latest" without `dangerouslySkipVersionCheck` set to true.
 *
 * **Why this error exists:**
 * Using "latest" version in manual execution can lead to unexpected behavior when new
 * toolkit versions are released, potentially breaking your application. For production
 * use, it's recommended to pin specific toolkit versions.
 *
 * **How to fix:**
 * 1. Specify a concrete version in the execute call
 * 2. Configure toolkit versions at SDK initialization
 * 3. Set toolkit version via environment variable
 * 4. Use dangerouslySkipVersionCheck (not recommended for production)
 *
 * @example ❌ This will throw ComposioToolVersionRequiredError if toolkitVersions is 'latest'
 * ```typescript
 * await composio.tools.execute('GITHUB_GET_REPOS', {
 *   userId: 'default',
 *   arguments: { owner: 'composio' }
 * });
 * ```
 *
 * @example ✅ Fix 1: Pass specific version in execute call
 * ```typescript
 * await composio.tools.execute('GITHUB_GET_REPOS', {
 *   userId: 'default',
 *   version: '20250909_00',
 *   arguments: { owner: 'composio' }
 * });
 * ```
 *
 * @example ✅ Fix 2: Configure toolkit versions at SDK level
 * ```typescript
 * const composio = new Composio({
 *   toolkitVersions: { github: '20250909_00' }
 * });
 * await composio.tools.execute('GITHUB_GET_REPOS', {
 *   userId: 'default',
 *   arguments: { owner: 'composio' }
 * });
 * ```
 *
 * @example ✅ Fix 3: Use environment variable
 * ```typescript
 * // Set: COMPOSIO_TOOLKIT_VERSION_GITHUB=20250909_00
 * await composio.tools.execute('GITHUB_GET_REPOS', {
 *   userId: 'default',
 *   arguments: { owner: 'composio' }
 * });
 * ```
 *
 * @example ⚠️ Fix 4: Skip version check (not recommended for production)
 * ```typescript
 * await composio.tools.execute('GITHUB_GET_REPOS', {
 *   userId: 'default',
 *   dangerouslySkipVersionCheck: true,
 *   arguments: { owner: 'composio' }
 * });
 * ```
 */
export class ComposioToolVersionRequiredError extends ComposioError {
  constructor(
    message: string = 'Toolkit version not specified. For manual execution of the tool please pass a specific toolkit version',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolErrorCodes.TOOL_VERSION_REQUIRED,
      possibleFixes: options.possibleFixes || [
        'Pass the toolkit version as a parameter to the execute function ("latest" is not supported in manual execution)',
        'Set the toolkit versions in the Composio config (toolkitVersions: { <toolkit-slug>: "<toolkit-version>" })',
        'Set the toolkit version in the environment variable (COMPOSIO_TOOLKIT_VERSION_<TOOLKIT_SLUG>)',
        'Set dangerouslySkipVersionCheck to true (this might cause unexpected behavior when new versions of the tools are released)',
      ],
    });
  }
}
