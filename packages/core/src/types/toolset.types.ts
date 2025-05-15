import { ExecuteToolModifiers } from './modifiers.types';
import {
  CustomAuthParams,
  Tool,
  ToolExecuteParams,
  ToolExecuteResponse,
  ToolListParams,
} from './tool.types';

/**
 * Base toolset implementation, which needs to be implemented by the extended class.
 * This class is used to create a base toolset by implementing this class.
 * This class also extends InstrumentedInstance, so that the telemetry can be instrumented for the toolset.
 */
export interface Toolset<TTool, TToolCollection> {
  wrapTool: (tool: Tool) => TTool;
  getTools: (params?: ToolListParams) => Promise<TToolCollection>;
}

export type ExecuteToolFnOptions = {
  connectedAccountId?: string;
  customAuthParams?: CustomAuthParams;
};

/**
 * This type is used to infer the wrapped tool type from the toolset.
 * It checks if the toolset has a method `_wrapTool` and infers the return type.
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
