export interface AnthropicTool {
  /**
   * [JSON schema](https://json-schema.org/draft/2020-12) for this tool's input.
   *
   * This defines the shape of the `input` that your tool accepts and that the model
   * will produce.
   */
  input_schema: InputSchema;

  /**
   * Name of the tool.
   *
   * This is how the tool will be called by the model and in `tool_use` blocks.
   */
  name: string;

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;

  /**
   * Description of what this tool does.
   *
   * Tool descriptions should be as detailed as possible. The more information that
   * the model has about what the tool is and how to use it, the better it will
   * perform. You can use natural language descriptions to reinforce important
   * aspects of the tool input JSON schema.
   */
  description?: string;

  type?: 'custom' | null;
}

/**
 * [JSON schema](https://json-schema.org/draft/2020-12) for this tool's input.
 *
 * This defines the shape of the `input` that your tool accepts and that the model
 * will produce.
 */
export interface InputSchema {
  type: 'object';

  properties?: unknown | null;

  [k: string]: unknown;
}

export interface CacheControlEphemeral {
  type: 'ephemeral';
}
