#!/usr/bin/env node
/**
 * index.ts
 *
 * Run MCP stdio servers over SSE or vice versa
 *
 * Usage:
 *   # stdio -> SSE
 *   npx -y mcp-transport --stdio "npx -y @modelcontextprotocol/server-filesystem /some/folder" \
 *                       --port 8000 --baseUrl http://localhost:8000 --ssePath /sse --messagePath /message
 *
 *   # SSE -> stdio
 *   npx -y mcp-transport --sse "https://mcp-server.example.com"
 */

/* eslint-disable no-console */
import { spawn } from 'child_process';
import express from 'express';
import bodyParser from 'body-parser';
import { Command } from 'commander';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const log = (...args: any[]): void => console.log('[mcp-transport]', ...args);
const logStderr = (...args: any[]): void => console.error('[mcp-transport]', ...args);

// If needed, adjust this logic to fetch version from package.json or a default
function getVersion(): string {
  return '1.0.0';
}

async function sseToStdio(sseUrl: string): Promise<void> {
  logStderr('Starting...');
  logStderr('MCP Transport utility');
  logStderr(`  - sse: ${sseUrl}`);
  logStderr('Connecting to SSE...');

  const sseTransport = new SSEClientTransport(new URL(sseUrl));
  const sseClient = new Client(
    { name: 'mcp-transport', version: getVersion() },
    { capabilities: {} }
  );

  sseTransport.onerror = (err: Error) => {
    logStderr('SSE error:', err);
  };
  sseTransport.onclose = () => {
    logStderr('SSE connection closed');
    process.exit(1);
  };

  await sseClient.connect(sseTransport);
  logStderr('SSE connected');

  const stdioServer = new Server(
    sseClient.getServerVersion() ?? { name: 'mcp-transport', version: getVersion() },
    { capabilities: sseClient.getServerCapabilities() }
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
      logStderr('Stdio → SSE:', message);
      const req = message as JSONRPCRequest;
      let result;
      try {
        result = await sseClient.request(req, z.any());
      } catch (err) {
        logStderr('Request error:', err);
        const errorCode =
          err && typeof err === 'object' && 'code' in err
            ? (err as any).code
            : -32000;
        let errorMsg =
          err && typeof err === 'object' && 'message' in err
            ? (err as any).message
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
        result.hasOwnProperty('error')
          ? { error: { ...result.error } }
          : { result: { ...result } }
      );
      logStderr('Response:', response);
      process.stdout.write(JSON.stringify(response) + '\n');
    } else {
      logStderr('SSE → Stdio:', message);
      process.stdout.write(JSON.stringify(message) + '\n');
    }
  };

  logStderr('Stdio server listening');
}

export default class SSETransportCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    
    // Add the transport command
    const transportCmd = this.program
      .command('transport')
      .description('Run MCP stdio servers over SSE or vice versa');
    
    
    // Add SSE to stdio subcommand
    transportCmd
      .command('sse-to-stdio <sseUrl>')
      .description('Connect to SSE MCP server and expose as stdio')
      .action(this.handleSseToStdio.bind(this));
  }

  private async handleSseToStdio(sseUrl: string): Promise<void> {
    await sseToStdio(sseUrl);
  }
}

