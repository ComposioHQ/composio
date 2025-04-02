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
/* eslint-disable no-console */

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
    try {
      // The symlink in node_modules points to mcp/dist, so we need to use cli/commands
      const commands = require("@composio/mcp/cli/commands/index.js");
      const startCommand =
        commands.startCommand || commands.default?.startCommand;

      if (!startCommand || !startCommand.handler) {
        throw new Error("Start command or handler not found");
      }

      // Use the handler from start.ts
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      await startCommand.handler({ url: sseUrl, _: [], $0: "" } as any);
    } catch (error) {
      console.error("Error importing MCP commands:", error);
      process.exit(1);
    }
  }
}
