// Core exports
export { Composio } from './composio';
export { OpenAIProvider } from './provider/OpenAIProvider';
export { ComposioProvider } from './provider/ComposioProvider';
export { BaseNonAgenticProvider, BaseAgenticProvider } from './provider/BaseProvider';
export type { BaseComposioProvider } from './provider/BaseProvider';
export {
  dereferenceJsonSchema,
  deduplicateJsonSchemaRequiredArrays,
  ensureObjectTypeOnProperties,
  jsonSchemaToZodSchema,
  omitNullToolArguments,
  removeNonRequiredProperties,
  toStrictJsonSchema,
} from './utils/jsonSchema';
export type {
  DereferenceJsonSchemaOptions,
  UnresolvedRefReason,
  UnresolvedRefStrategy,
  StrictSchemaChange,
  StrictSchemaChangeReason,
  StrictSchemaIncompatibility,
  StrictJsonSchemaResult,
} from './utils/jsonSchema';
export { getExtensionFromMimeType } from './utils/mime';
export { normalizeToolArguments } from './utils/toolArguments';
// Sensitive-file-upload denylist guard. This is the single canonical
// implementation; downstream packages (e.g. `@composio/cli`) import it here so
// every local-file upload path enforces the same denylist. Safe in the edge
// bundle: the module routes filesystem access through `#platform`.
export {
  assertSafeFileUploadPath,
  isBlockedSensitiveFileUploadPath,
  BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS,
} from './utils/sensitiveFileUploadPaths';
// Bounded response reader for files fetched from user-supplied URLs. Exported
// for the same reason as the denylist guard above: downstream packages read
// remote files too, and every such read must enforce the same size cap.
export { readResponseBodyWithLimit, MAX_URL_UPLOAD_SIZE_BYTES } from './utils/readResponseBody';
export {
  sanitizeSchemaPropertyKeys,
  restoreOriginalKeys,
  mappingHasRenames,
} from './utils/schemaPropertyKeys';
export type { KeyMapping, KeySanitizationPolicy } from './utils/schemaPropertyKeys';
export { AuthScheme } from './models/AuthScheme';
export { MCP } from './models/MCP';
export { Webhooks, WebhookSubscriptions, WebhookEndpoints } from './models/Webhooks';
export { Logs } from './models/Logs';
export { Usage } from './models/Usage';
export { Keyring } from './models/Keyring';
export { CustomToolkits } from './models/CustomToolkits';
export { RemoteFile } from './models/RemoteFile';
export { createConnectionRequest } from './models/ConnectionRequest';
export { ToolRouterSession } from './models/ToolRouterSession';
export { Sessions } from './models/Sessions';
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
export * from './types/webhooks.types';
export * from './types/logs.types';
export * from './types/usage.types';
export * from './types/keyring.types';
export * from './types/customToolkits.types';
export * from './types/mcp.types';
export * from './types/files.types';
export * from './types/connectionRequest.types';
export * from './types/toolRouter.types';
export * from './types/ToolRouterSessionFilesMount.types';
export * from './types/requestOptions.types';
export * as constants from './utils/constants';

export { default as logger } from './utils/logger';
export type { ComposioLogger, LogLevel } from './utils/logger';
export { telemetry } from './telemetry/Telemetry';

// Experimental custom tools — exported with experimental_ prefix for top-level import
export { createCustomTool as experimental_createTool } from './models/CustomTool';
export { createCustomToolkit as experimental_createToolkit } from './models/CustomTool';

// Experimental shared connected accounts — shape may change in future releases.
// Prefer `composio.connectedAccounts.updateAcl(...)`; the experimental
// namespace keeps `composio.experimental.updateAcl(...)` as an alias while
// the API is experimental. The `Experimental` class itself is re-exported
// so callers can type their own composio handles (e.g. in test helpers).
export { Experimental } from './models/Experimental';

// Error handling exports
export * from './errors';
