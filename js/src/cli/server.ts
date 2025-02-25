/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs";
import path from "path";
import os from "os";

import client from "../sdk/client/client";
import { getOpenAPIClient } from "../sdk/utils/config";

type ErrorWithMessage = {
  message: string;
};

export default class MCPCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    const command = this.program
      .command("mcp")
      .argument("<url>", "The app to use")
      .option("--client <client>", "Client to use (claude, windsurf)", "claude")
      .description("MCP command for app integration");

    command.action(this.handleAction.bind(this));
  }

  private async handleAction(
    url: string,
    options: { client: string }
  ): Promise<void> {
    getOpenAPIClient();
    const clientType = options.client;

    // Validate client type
    if (!["claude", "windsurf"].includes(clientType)) {
      console.log(
        chalk.red(
          "Invalid client type. Please use one of: claude, windsurf"
        )
      );
      return;
    }

    try {
      console.log(`Using url: ${chalk.green(url)} with client: ${chalk.green(clientType)}`);
      

      // Create the MCP URL
      const mcpUrl = url;
      
      // Format the command based on client type
      let command = "";
      if (clientType === "claude") {
        command = `npx -y supergateway --sse "${mcpUrl}"`;
      } else if (clientType === "windsurf") {
        command = `windsurf connect "${mcpUrl}"`;
      }
      
      // Save to MCP config
      this.saveMcpConfig(url, clientType, mcpUrl, command);
      
      console.log(chalk.green("MCP configuration created successfully!"));
      console.log(chalk.cyan("Command to run:"));
      console.log(chalk.bold(command));
      
    } catch (error) {
      console.log(chalk.red((error as ErrorWithMessage).message));
      return;
    }
  }
  
  private generateSessionId(): string {
    return [
      Date.now().toString(36),
      Math.random().toString(36).substring(2, 15)
    ].join('-');
  }
  
  private saveMcpConfig(
    url: string, 
    clientType: string, 
    mcpUrl: string, 
    command: string
  ): void {
    const configDir = path.join(os.homedir(), '.composio');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const configPath = path.join(configDir, 'mcp-config.json');
    
    // Read existing config or create new one
    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
      } catch (error) {
        console.log(chalk.yellow("Could not read existing config, creating new one."));
      }
    }
    
    // Update config
    config = {
      ...config,
      [url]: {
        clientType,
        mcpUrl,
        command,
        createdAt: new Date().toISOString()
      }
    };
    
    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // For Claude Desktop, also save to the Claude Desktop config location on macOS
    if (clientType === "claude" && os.platform() === "darwin") {
      const claudeDesktopConfigDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
      
      // Create Claude Desktop config directory if it doesn't exist
      if (!fs.existsSync(claudeDesktopConfigDir)) {
        fs.mkdirSync(claudeDesktopConfigDir, { recursive: true });
      }
      
      const claudeDesktopConfigPath = path.join(claudeDesktopConfigDir, 'claude_desktop_config.json');
      
      // Create Claude Desktop config with the MCP URL
      const claudeDesktopConfig = {
        mcpServers: {
          [url]: {
            command: "npx",
            args: [
              "-y",
              "supergateway",
              "--sse",
              mcpUrl
            ]
          }
        }
      };
      
      fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify(claudeDesktopConfig, null, 2));
      console.log(chalk.green(`Claude Desktop configuration saved to: ${claudeDesktopConfigPath}`));
    }
  }
}
