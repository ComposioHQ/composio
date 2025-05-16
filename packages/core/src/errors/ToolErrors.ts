import { ComposioError } from './ComposioError';

export const ToolErrorCodes = {
  TOOLSET_NOT_DEFINED: 'TOOLSET_NOT_DEFINED',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INVALID_MODIFIER: 'INVALID_MODIFIER',
  CUSTOM_TOOLS_NOT_INITIALIZED: 'CUSTOM_TOOLS_NOT_INITIALIZED',
  TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
  INVALID_EXECUTE_FUNCTION: 'INVALID_EXECUTE_FUNCTION',
} as const;

export class ComposioToolsetNotDefinedError extends ComposioError {
  constructor(message: string = 'Toolset not defined', meta: Record<string, unknown> = {}) {
    super(message, {
      code: ToolErrorCodes.TOOLSET_NOT_DEFINED,
      meta,
      possibleFixes: [
        'Ensure that the toolset is defined in the Composio project and passed into the tool instance',
      ],
    });
    this.name = 'ComposioToolsetNotDefinedError';
  }
}

export class ComposioToolNotFoundError extends ComposioError {
  constructor(message: string = 'Tool not found', meta: Record<string, unknown> = {}) {
    super(message, {
      code: ToolErrorCodes.TOOL_NOT_FOUND,
      meta,
      possibleFixes: ['Ensure the tool slug is correct and exists in the Composio project'],
    });
    this.name = 'ComposioToolNotFoundError';
  }
}

export class ComposioInvalidModifierError extends ComposioError {
  constructor(message: string = 'Invalid modifier', meta: Record<string, unknown> = {}) {
    super(message, {
      code: ToolErrorCodes.INVALID_MODIFIER,
      meta,
      possibleFixes: ['Ensure the modifier is a function and returns a valid result'],
    });
    this.name = 'ComposioInvalidModifierError';
  }
}

export class ComposioCustomToolsNotInitializedError extends ComposioError {
  constructor(
    message: string = 'Custom tools not initialized',
    meta: Record<string, unknown> = {}
  ) {
    super(message, {
      code: ToolErrorCodes.CUSTOM_TOOLS_NOT_INITIALIZED,
      meta,
      possibleFixes: ['Ensure the custom tools class is initialized in the Tools instance'],
    });
    this.name = 'ComposioCustomToolsNotInitializedError';
  }
}

export class ComposioToolExecutionError extends ComposioError {
  public readonly error: Error;
  constructor(
    error: Error,
    message: string = 'Tool execution error',
    meta: Record<string, unknown> = {}
  ) {
    super(message, {
      code: ToolErrorCodes.TOOL_EXECUTION_ERROR,
      cause: error,
      meta,
      possibleFixes: ['Ensure the tool is correctly configured and the input is valid'],
    });

    this.error = error;
    this.name = 'ComposioToolExecutionError';
  }
}

export class ComposioInvalidExecuteFunctionError extends ComposioError {
  constructor(message: string = 'Invalid execute function', meta: Record<string, unknown> = {}) {
    super(message, {
      code: ToolErrorCodes.INVALID_EXECUTE_FUNCTION,
      meta,
      possibleFixes: ['Ensure the execute function is a valid function and returns a valid result'],
    });
    this.name = 'ComposioInvalidExecuteFunctionError';
  }
}
