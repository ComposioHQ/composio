import type {
  SessionExecuteParams,
  SessionSearchParams,
} from '@composio/client/resources/tool-router/session/session.mjs';
import type { InlineCustomToolsWirePayload } from '../types/customTool.types';

type InlineCustomToolsExperimental =
  | SessionExecuteParams.Experimental
  | SessionSearchParams.Experimental;

export function inlineCustomToolsExperimental<TExperimental extends InlineCustomToolsExperimental>(
  payload?: InlineCustomToolsWirePayload
): TExperimental | undefined {
  // Stainless generates endpoint-specific experimental types with the same custom
  // definition shape, so this helper centralizes the structural cast.
  return payload as TExperimental | undefined;
}
