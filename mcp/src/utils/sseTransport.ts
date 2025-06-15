import { JSONRPCRequest } from 'composiohq-modelcontextprotocol-typescript-sdk/types';
import { SSEClientTransport } from 'composiohq-modelcontextprotocol-typescript-sdk/client/sse';
import { StreamableHTTPClientTransport } from 'composiohq-modelcontextprotocol-typescript-sdk/client/streamableHttp';
import { Client } from 'composiohq-modelcontextprotocol-typescript-sdk/client/index';
import { z } from 'zod';

export async function getSSEClient(
  sseUrl: string,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  logStderr: (...args: any[]) => void
) {
  // const {
  //   SSEClientTransport,
  // } = require('composiohq-modelcontextprotocol-typescript-sdk/client/sse');
  // const {
  //   JSONRPCRequest,
  // } = require('composiohq-modelcontextprotocol-typescript-sdk/dist/cjs/types.js');
  // Lazy import Client and StdioServerTransport to avoid ESM issues
  // const {
  //   Client,
  // } = require('composiohq-modelcontextprotocol-typescript-sdk/dist/cjs/client/index.js');
  let sseTransport = new StreamableHTTPClientTransport(new URL(sseUrl));

  const sseClient = new Client(
    { name: 'mcp-transport', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
      },
    }
  );
  const originalRequest = sseClient.request;
  let isConnecting = false;
  let connectionPromise: Promise<void> | null = null;

  const connect = async () => {
    if (isConnecting) {
      return connectionPromise;
    }

    isConnecting = true;
    connectionPromise = (async () => {
      const maxRetries = 5;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          try {
            await sseClient.close();
            await sseTransport.close();
          } catch (error) {
            // Ignore close errors
          }
          sseTransport = new StreamableHTTPClientTransport(new URL(sseUrl));

          sseTransport.onerror = async (err: Error) => {
            logStderr('MCP Server error:', err);
          };

          sseTransport.onclose = async () => {
            logStderr('MCP Server connection closed');
            try {
              await connect();
            } catch (error) {
              logStderr('Failed to reconnect after connection close:', error);
              process.exit(1);
            }
          };

          await sseClient.connect(sseTransport);
          return; // Success - exit the retry loop
        } catch (error) {
          retryCount++;
          logStderr(`MCP Server connection error (attempt ${retryCount}/${maxRetries}):`, error);

          if (retryCount === maxRetries) {
            throw error;
          }

          // Exponential backoff before retry
          const backoffMs = Math.min(Math.pow(2, retryCount) * 1000, 30000); // Cap at 30 seconds
          logStderr(`Retrying in ${backoffMs / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    })().finally(() => {
      isConnecting = false;
      connectionPromise = null;
    });

    return connectionPromise;
  };

  sseClient.request = async (request: JSONRPCRequest, schema: z.ZodSchema) => {
    const maxRequestRetries = 3;
    let requestRetryCount = 0;

    while (requestRetryCount < maxRequestRetries) {
      try {
        const output = await originalRequest.call(sseClient, request, schema);
        return output;
      } catch (error) {
        // Only retry for network-related errors
        const isNetworkError =
          error instanceof Error &&
          (error.message.includes('network') ||
            error.message.includes('connection') ||
            error.message.includes('timeout') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT'));

        if (!isNetworkError) {
          throw error; // Don't retry for non-network errors
        }

        requestRetryCount++;
        logStderr(
          `Network request error (attempt ${requestRetryCount}/${maxRequestRetries}):`,
          error
        );

        if (requestRetryCount === maxRequestRetries) {
          throw error;
        }

        // Try to reconnect before retrying the request
        try {
          await connect();
        } catch (connectError) {
          logStderr('Failed to reconnect:', connectError);
          throw error; // Throw original error if reconnect fails
        }

        // Add small delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Request failed after all retries');
  };

  await connect();

  return { sseClient, originalRequest, sseTransport };
}
