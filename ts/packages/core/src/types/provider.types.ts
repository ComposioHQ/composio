import { ExecuteToolModifiers } from './modifiers.types';
import {
  CustomAuthParams,
  Tool,
  ToolExecuteParams,
  ToolExecuteResponse,
  ToolkitVersion,
  ToolListParams,
} from './tool.types';
import { CustomConnectionData } from './connectedAccountAuthStates.types';

/**
 * Base provider implementation, which needs to be implemented by the extended class.
 * This class is used to create a base provider by implementing this class.
 * This class also extends InstrumentedInstance, so that the telemetry can be instrumented for the provider.
 */
export interface Provider<TTool, TToolCollection> {
  wrapTool: (tool: Tool) => TTool;
  getTools: (params?: ToolListParams) => Promise<TToolCollection>;
}

export type ExecuteToolFnOptions = {
  connectedAccountId?: string;
  customAuthParams?: CustomAuthParams;
  customConnectionData?: CustomConnectionData;
  version?: ToolkitVersion;
};

/**
 * This type is used to infer the wrapped tool type from the provider.
 * It checks if the provider has a method `_wrapTool` and infers the return type.
 */
export type ExecuteToolFn = (
  toolSlug: string,
  input: Record<string, unknown>
) => Promise<ToolExecuteResponse>;

export type GlobalExecuteToolFn = (
  slug: string,
  body: ToolExecuteParams,
  modifiers?: ExecuteToolModifiers
) => Promise<ToolExecuteResponse>;
