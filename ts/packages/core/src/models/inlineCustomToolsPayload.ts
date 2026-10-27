import type {
  SessionExecuteParams,
  SessionSearchParams,
} from '@composio/client/resources/tool-router/session';
import type { InlineCustomToolsWirePayload } from '../types/customTool.types';

type InlineCustomToolsExperimental =
  | NonNullable<SessionExecuteParams['experimental']>
  | NonNullable<SessionSearchParams['experimental']>;

export function inlineCustomToolsExperimental<TExperimental extends InlineCustomToolsExperimental>(
  payload?: InlineCustomToolsWirePayload
): TExperimental | undefined {
  // Stainless generates endpoint-specific experimental types with the same custom
  // definition shape, so this helper centralizes the structural cast.
  return payload as TExperimental | undefined;
}
