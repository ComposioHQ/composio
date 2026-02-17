import { Tool, ToolExecuteParams, ToolExecuteResponse } from '../../types/tool.types';
import ComposioClient from '@composio/client';
import { transformProperties } from './FileToolModifier.utils.neutral';

const UNSUPPORTED_MESSAGE =
  'File upload/download modifiers are not available on edge runtimes yet. ' +
  'Please set `autoUploadDownloadFiles: false` or run Composio in another JS runtime (Node.js / Bun).';

export class FileToolModifier {
  constructor(_client: ComposioClient) {}

  async modifyToolSchema(toolSlug: string, toolkitSlug: string, schema: Tool): Promise<Tool> {
    if (!schema.inputParameters?.properties) {
      return schema;
    }

    const properties = transformProperties(schema.inputParameters.properties);

    return {
      ...schema,
      inputParameters: {
        ...schema.inputParameters,
        properties,
      },
    };
  }

  async fileUploadModifier(
    _tool: Tool,
    _options: {
      toolSlug: string;
      toolkitSlug?: string;
      params: ToolExecuteParams;
    }
  ): Promise<ToolExecuteParams> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  async fileDownloadModifier(
    _tool: Tool,
    _options: {
      toolSlug: string;
      toolkitSlug: string;
      result: ToolExecuteResponse;
    }
  ): Promise<ToolExecuteResponse> {
    throw new Error(UNSUPPORTED_MESSAGE);
  }
}
