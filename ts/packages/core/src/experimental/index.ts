/**
 * Experimental APIs for `@composio/core`, exposed on the
 * `@composio/core/experimental` subpath. **Experimental — shape may change in
 * future releases.**
 *
 * The stateless tool/toolkit factories (`experimental_createTool`,
 * `experimental_createToolkit`) are ALSO re-exported from the package root, so
 * for those prefer the shorter import:
 *   `import { experimental_createTool, experimental_createToolkit } from '@composio/core';`
 *
 * The experimental local workbench helpers now live in the standalone
 * `@composio/experimental` package, on the `@composio/experimental/workbench`
 * subpath — they are no longer part of `@composio/core`.
 */

// Re-export for backward compatibility with existing code
export {
  createCustomTool as experimental_createTool,
  createCustomToolkit as experimental_createToolkit,
} from '../models/CustomTool';
export type {
  CustomTool,
  CreateCustomToolParams,
  CustomToolExecuteFn,
  SessionContext,
  CustomToolkit,
  CreateCustomToolkitParams,
} from '../types/customTool.types';
