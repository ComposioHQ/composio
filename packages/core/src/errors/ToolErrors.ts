import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ToolErrorCodes = {
  TOOLSET_NOT_DEFINED: 'TOOLSET_NOT_DEFINED',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INVALID_MODIFIER: 'INVALID_MODIFIER',
  CUSTOM_TOOLS_NOT_INITIALIZED: 'CUSTOM_TOOLS_NOT_INITIALIZED',
  TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
  INVALID_EXECUTE_FUNCTION: 'INVALID_EXECUTE_FUNCTION',
  GLOBAL_EXECUTE_TOOL_FN_NOT_SET: 'GLOBAL_EXECUTE_TOOL_FN_NOT_SET',
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
      (options.cause instanceof Error ? options.cause : 
        (options.cause ? new Error(String(options.cause)) : new Error('Unknown error')));
    
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
