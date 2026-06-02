// Core exports
export { Composio } from './composio';
export { OpenAIProvider } from './provider/OpenAIProvider';
export { ComposioProvider } from './provider/ComposioProvider';
export { BaseNonAgenticProvider, BaseAgenticProvider } from './provider/BaseProvider';
export type { BaseComposioProvider } from './provider/BaseProvider';
export {
  dereferenceJsonSchema,
  jsonSchemaToZodSchema,
  removeNonRequiredProperties,
} from './utils/jsonSchema';
export { getExtensionFromMimeType } from './utils/mime';
export { AuthScheme } from './models/AuthScheme';
export { MCP } from './models/MCP';
export { RemoteFile } from './models/RemoteFile';
export { createConnectionRequest } from './models/ConnectionRequest';
export { ToolRouterSession } from './models/ToolRouterSession';
export * from './types/provider.types';
export * from './types/customTool.types';
export * from './types/tool.types';
export * from './types/authConfigs.types';
export * from './types/modifiers.types';
export * from './types/connectedAccountAuthStates.types';
export * from './types/connectedAccounts.types';
export * from './types/toolkit.types';
export * from './types/triggers.types';
export * from './types/webhookEvents.types';
export * from './types/mcp.types';
export * from './types/files.types';
export * from './types/connectionRequest.types';
export * from './types/toolRouter.types';
export * from './types/ToolRouterSessionFilesMount.types';
export * as constants from './utils/constants';

export { default as logger } from './utils/logger';

// Experimental custom tools — exported with experimental_ prefix for top-level import
export { createCustomTool as experimental_createTool } from './models/CustomTool';
export { createCustomToolkit as experimental_createToolkit } from './models/CustomTool';

// Experimental shared connected accounts — shape may change in future releases.
// `updateAcl` is mounted as a method on `composio.experimental.updateAcl(...)`
// because it takes a client and performs I/O. The `Experimental` class
// itself is re-exported so callers can type their own composio handles
// (e.g. in test helpers).
export { Experimental } from './models/Experimental';

// Error handling exports
export * from './errors';
