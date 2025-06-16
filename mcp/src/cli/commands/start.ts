import type { CommandModule } from 'yargs';

import { z } from 'zod';
import { JSONRPCMessage, JSONRPCRequest } from 'composiohq-modelcontextprotocol-typescript-sdk/types';
import { getSSEClient } from '../../utils/sseTransport';
import { StdioServerTransport } from 'composiohq-modelcontextprotocol-typescript-sdk/server/stdio';
import { Server } from 'composiohq-modelcontextprotocol-typescript-sdk/server/index';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const log = (...args: any[]) => console.error('[composio-transport]', ...args);
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const logStderr = (...args: any[]) => console.error('[composio-transport]', ...args);

// If needed, adjust this logic to fetch version from package.json or a default
function getVersion(): string {
  return '1.0.0';
}

async function sseToStdio(sseUrl: string): Promise<void> {
  logStderr('Starting...');
  logStderr('MCP Transport utility');
  logStderr(`  - sse: ${sseUrl}`);
  logStderr('Connecting to MCP Server...');
  const { sseClient, originalRequest, sseTransport } = await getSSEClient(sseUrl, logStderr);

  logStderr('MCP Server connected');
  logStderr('getServerCapabilities ' + JSON.stringify(sseClient.getServerCapabilities()));
  const stdioServer = new Server(
    sseClient.getServerVersion()
      ? {
          name: 'mcp-transport',
          version: getVersion(),
        }
      : {
          name: 'mcp-transport',
          version: getVersion(),
        }
  );
  const stdioTransport = new StdioServerTransport();
  await stdioServer.connect(stdioTransport);

  const wrapResponse = (req: JSONRPCRequest, payload: object) => ({
    jsonrpc: req.jsonrpc || '2.0',
    id: req.id,
    ...payload,
  });

  stdioServer.transport!.onmessage = async (message: JSONRPCMessage) => {
    if ('method' in message && 'id' in message) {
      logStderr('Stdio → MCP Server:', message);
      const req = message as JSONRPCRequest;
      let result;
      try {
        result = await sseClient.request(req, z.any());
      } catch (err) {
        logStderr('Request error:', err);
        const errorCode =
          err && typeof err === 'object' && 'code' in err
            ? /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              (err as any).code
            : -32000;
        let errorMsg =
          err && typeof err === 'object' && 'message' in err
            ? /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              (err as any).message
            : 'Internal error';
        const prefix = `MCP error ${errorCode}:`;
        if (errorMsg.startsWith(prefix)) {
          errorMsg = errorMsg.slice(prefix.length).trim();
        }
        const errorResp = wrapResponse(req, {
          error: {
            code: errorCode,
            message: errorMsg,
          },
        });
        process.stdout.write(JSON.stringify(errorResp) + '\n');
        return;
      }
      const response = wrapResponse(
        req,
        result.hasOwnProperty('error') ? { error: { ...result.error } } : { result: { ...result } }
      );
      logStderr('Response:', response);
      process.stdout.write(JSON.stringify(response) + '\n');
    } else {
      logStderr('MCP Server → Stdio:', message);
      process.stdout.write(JSON.stringify(message) + '\n');
    }
  };

  logStderr('Stdio server listening');
}

const command: CommandModule = {
  command: 'start',
  describe: 'Start the MCP server',
  builder: {
    url: {
      type: 'string',
      default: 'http://localhost:3000',
      describe: 'URL to run the server on',
    },
  },
  handler: async argv => {
    const { url } = argv;
    await sseToStdio(url as string);
    logStderr('Server started');
    // TODO: Implement server start logic
  },
};

export default command;
