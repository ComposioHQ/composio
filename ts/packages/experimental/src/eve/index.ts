/**
 * Experimental Composio provider for the eve agent framework.
 *
 * `EveProvider` makes `session.tools()` return eve-native `defineTool`s;
 * `defineComposioTools` is the replay-safe resolver that hands them to eve.
 *
 * @module experimental/eve
 */
export { EveProvider, requireApprovalForTools } from './provider';
export type { EveNeedsApproval, EveProviderOptions, EveTool, EveToolCollection } from './provider';
export { defineComposioTools } from './resolver';
export { denyEveToolCall } from './hooks';
export type {
  EveHook,
  EveAuthLinkHook,
  EveHookContext,
  EveAuthLinkContext,
  EveHookControls,
  EveProviderHooks,
} from './hooks';
