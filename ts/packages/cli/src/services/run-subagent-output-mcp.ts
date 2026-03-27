import path from 'node:path';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { jsonSchemaToZodSchema } from '@composio/core';
import {
  ACP_STRUCTURED_OUTPUT_TOOL_NAME,
  buildStructuredOutputToolSchema,
} from 'src/services/run-subagent-shared';

const readFlag = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`Missing required flag: ${name}`);
  }
  return value;
};

type McpServerInstance = {
  registerTool: (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: unknown;
    },
    cb: (payload: unknown) => Promise<{
      content: Array<{
        type: string;
        text: string;
      }>;
    }>
  ) => void;
  connect: (transport: unknown) => Promise<void>;
};

type McpServerConstructor = new (serverInfo: {
  name: string;
  version: string;
}) => McpServerInstance;

type StdioServerTransportConstructor = new () => unknown;

const loadMcpSdk = async (): Promise<{
  McpServer: McpServerConstructor;
  StdioServerTransport: StdioServerTransportConstructor;
}> => {
  const require = createRequire(import.meta.url);
  const sdkPackageJsonPath = require.resolve('@modelcontextprotocol/sdk/package.json');
  const sdkDirectory = path.dirname(sdkPackageJsonPath);
  const [mcpModule, stdioModule] = await Promise.all([
    import(pathToFileURL(path.join(sdkDirectory, 'dist/esm/server/mcp.js')).href),
    import(pathToFileURL(path.join(sdkDirectory, 'dist/esm/server/stdio.js')).href),
  ]);

  return {
    McpServer: mcpModule.McpServer as McpServerConstructor,
    StdioServerTransport: stdioModule.StdioServerTransport as StdioServerTransportConstructor,
  };
};

const main = async (): Promise<void> => {
  const { McpServer, StdioServerTransport } = await loadMcpSdk();
  const schemaFilePath = readFlag('--schema-file');
  const resultFilePath = readFlag('--result-file');
  const schemaText = fs.readFileSync(schemaFilePath, 'utf8');
  const structuredSchema = JSON.parse(schemaText) as Record<string, unknown>;
  const toolInputSchema = jsonSchemaToZodSchema(buildStructuredOutputToolSchema(structuredSchema));

  const server = new McpServer({
    name: 'composio-subagent-output',
    version: '1.0.0',
  });

  server.registerTool(
    ACP_STRUCTURED_OUTPUT_TOOL_NAME,
    {
      title: 'Submit structured output',
      description:
        'Submit the final structured experimental_subAgent output. Call this exactly once when the task is complete.',
      inputSchema: toolInputSchema,
    },
    async (payload: unknown) => {
      fs.writeFileSync(resultFilePath, JSON.stringify(payload), 'utf8');
      return {
        content: [
          {
            type: 'text',
            text: 'Structured output captured.',
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
};

void main().catch(error => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
