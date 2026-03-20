/**
 * Experimental APIs for @composio/core.
 *
 * @deprecated Import from '@composio/core' instead:
 *   import { experimental_createTool, experimental_createToolkit } from '@composio/core';
 */

// Re-export for backward compatibility with existing code
export { createCustomTool as experimental_createTool, createCustomToolkit as experimental_createToolkit } from '../models/CustomTool';
export type {
  CustomTool,
  CreateCustomToolParams,
  CustomToolExecuteFn,
  SessionContext,
  CustomToolkit,
  CreateCustomToolkitParams,
} from '../types/customTool.types';
