import * as fs from 'node:fs';
import process from 'node:process';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

const main = async (): Promise<void> => {
  const schemaFilePath = readFlag('--schema-file');
  const resultFilePath = readFlag('--result-file');
  const schemaText = fs.readFileSync(schemaFilePath, 'utf8');
  const structuredSchema = JSON.parse(schemaText) as Record<string, unknown>;
  const toolInputSchema = jsonSchemaToZod(buildStructuredOutputToolSchema(structuredSchema));

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
