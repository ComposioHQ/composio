#!/usr/bin/env node
/**
 * index.ts
 *
 * Run MCP stdio servers over SSE
 *
 * Usage:
 *   # SSE -> stdio
 *   npx composio transport --sse https://mcp-server.example.com
 */

/* eslint-disable no-console */
import { Command } from "commander";
import { z } from "zod";
// Use dynamic import for SSEClientTransport to avoid ESM issues
import { JSONRPCMessage, JSONRPCRequest } from "composiohq-modelcontextprotocol-typescript-sdk/types.js";
import { getSSEClient } from "./src/sseTransport";


const log = (...args: any[]) => console.log('[composio-transport]', ...args)
const logStderr = (...args: any[]) => console.error('[composio-transport]', ...args)

// If needed, adjust this logic to fetch version from package.json or a default
function getVersion(): string {
  return "1.0.0";
}

async function sseToStdio(sseUrl: string): Promise<void> {
  logStderr("Starting...");
  logStderr("MCP Transport utility");
  logStderr(`  - sse: ${sseUrl}`);
  logStderr("Connecting to SSE...");

  
  // @fix: this does not work in dev CLI environment because of esm module.
  const { SSEClientTransport } = await import(
    "composiohq-modelcontextprotocol-typescript-sdk/client/sse.js"
  );
  // Lazy import Client and StdioServerTransport to avoid ESM issues
  const { Client } = await import("composiohq-modelcontextprotocol-typescript-sdk/client/index.js");
  const { StdioServerTransport } = await import("composiohq-modelcontextprotocol-typescript-sdk/server/stdio.js");
  const { Server } = await import("composiohq-modelcontextprotocol-typescript-sdk/server/index.js");
  const { sseClient, originalRequest, sseTransport } = await getSSEClient(sseUrl, logStderr);

  logStderr("SSE connected");
  logStderr("getServerCapabilities " + JSON.stringify(sseClient.getServerCapabilities()));
  const stdioServer = new Server(
    sseClient.getServerVersion() ?? {
      name: "mcp-transport",
      version: getVersion(),
    },
  );
  const stdioTransport = new StdioServerTransport();
  await stdioServer.connect(stdioTransport);

  const wrapResponse = (req: JSONRPCRequest, payload: object) => ({
    jsonrpc: req.jsonrpc || "2.0",
    id: req.id,
    ...payload,
  });

 stdioServer.transport!.onmessage = async (message: JSONRPCMessage) => {
    if ("method" in message && "id" in message) {
      logStderr("Stdio → SSE:", message);
      const req = message as JSONRPCRequest;
      let result;
      try {
        result = await sseClient.request(req, z.any());
      } catch (err) {
        logStderr("Request error:", err);
        const errorCode =
          err && typeof err === "object" && "code" in err
            ? (err as any).code
            : -32000;
        let errorMsg =
          err && typeof err === "object" && "message" in err
            ? (err as any).message
            : "Internal error";
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
        process.stdout.write(JSON.stringify(errorResp) + "\n");
        return;
      }
      const response = wrapResponse(
        req,
        result.hasOwnProperty("error")
          ? { error: { ...result.error } }
          : { result: { ...result } }
      );
      logStderr("Response:", response);
      process.stdout.write(JSON.stringify(response) + "\n");
    } else {
      logStderr("SSE → Stdio:", message);
      process.stdout.write(JSON.stringify(message) + "\n");
    }
  };

  logStderr("Stdio server listening");
}

export default class SSETransportCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    // Add the transport command
    this.program
      .command("transport")
      .description("Run MCP stdio servers over SSE or vice versa")
      .option("--sse <url>", "SSE URL to connect to and expose as stdio")
      .action((options) => {
        if (options.sse) {
          this.handleSseToStdio(options.sse);
        } else {
          console.error("Error: You must specify --sse option");
          process.exit(1);
        }
      });
  }

  private async handleSseToStdio(sseUrl: string): Promise<void> {
    await sseToStdio(sseUrl);
  }
}