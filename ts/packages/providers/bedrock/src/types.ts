/**
 * @file Type definitions for AWS Bedrock provider
 * @module providers/bedrock/types
 * @description
 * Type definitions for AWS Bedrock Converse API integration including
 * tool specifications, tool use blocks, and tool result formats.
 *
 * @copyright Composio 2024
 * @license ISC
 *
 * @see {@link https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Tool.html}
 */

/**
 * Bedrock tool specification following AWS Bedrock Converse API format
 */
export interface BedrockToolSpec {
  /**
   * Name of the tool
   */
  name: string;

  /**
   * Description of what this tool does
   */
  description: string;

  /**
   * Input schema for the tool using JSON Schema format
   */
  inputSchema: {
    json: InputSchema;
  };
}

/**
 * Bedrock tool configuration
 */
export interface BedrockTool {
  toolSpec: BedrockToolSpec;
}

/**
 * JSON schema for tool input parameters
 * Matches AWS Bedrock's expected JSON Schema format
 */
export interface InputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * Bedrock tool use block in message content
 */
export interface BedrockToolUseBlock {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Bedrock tool result block
 */
export interface BedrockToolResultBlock {
  toolUseId: string;
  content: Array<{
    json?: Record<string, unknown>;
    text?: string;
  }>;
  status?: 'success' | 'error';
}
