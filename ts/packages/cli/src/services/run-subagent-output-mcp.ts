import process from 'node:process';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import { FileSystem } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Effect } from 'effect';
import {
  ACP_STRUCTURED_OUTPUT_TOOL_NAME,
  buildStructuredOutputToolSchema,
  decodeStructuredSchemaJson,
} from 'src/services/run-subagent-shared';
import { TerminalUI, TerminalUILive } from 'src/services/terminal-ui';

const readFlag = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`Missing required flag: ${name}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const fs = Effect.runSync(FileSystem.FileSystem.pipe(Effect.provide(BunFileSystem.layer)));
  const schemaFilePath = readFlag('--schema-file');
  const resultFilePath = readFlag('--result-file');
  const schemaText = await Effect.runPromise(fs.readFileString(schemaFilePath));
  const structuredSchema = decodeStructuredSchemaJson(schemaText);
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
      await Effect.runPromise(fs.writeFileString(resultFilePath, JSON.stringify(payload)));
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
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* ui.error(message);
  }).pipe(Effect.provide(TerminalUILive), Effect.runSync);
  process.exit(1);
});
