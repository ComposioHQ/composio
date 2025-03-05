/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs";
import os from "os";
import path from "path";

import { getOpenAPIClient } from "../sdk/utils/config";

type ErrorWithMessage = {
  message: string;
};

interface MCPConfig {
  command: string;
  args: string[];
}

interface WindsurfConfig {
  mcpServers: {
    [key: string]: MCPConfig;
  };
}

interface ClaudeConfig {
  mcpServers: {
    [key: string]: MCPConfig;
  };
}

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
      console.log(chalk.red("❌ Error: Invalid client type specified"));
      console.log(chalk.yellow("Please use one of these supported clients:"));
      console.log(chalk.yellow("- claude"));
      console.log(chalk.yellow("- windsurf"));
      return;
    }

    try {
      console.log(chalk.cyan("📝 Configuration Details:"));
      console.log(`   URL: ${chalk.green(url)}`);
      console.log(`   Client: ${chalk.green(clientType)}\n`);

      const mcpUrl = url;
      const command = `composio --sse "${mcpUrl}"`;

      console.log(chalk.cyan("💾 Saving configurations..."));

      this.saveMcpConfig(url, clientType, mcpUrl, command);

      console.log(
        chalk.cyan(
          `\n🚀 All done! Please restart ${clientType} for changes to take effect\n`
        )
      );
    } catch (error) {
      console.log(chalk.red("\n❌ Error occurred while setting up MCP:"));
      console.log(chalk.red(`   ${(error as ErrorWithMessage).message}`));
      console.log(
        chalk.yellow(
          "\nPlease try again or contact support if the issue persists.\n"
        )
      );
      return;
    }
  }

  private saveMcpConfig(
    url: string,
    clientType: string,
    mcpUrl: string,
    command: string
  ): void {
    const config: MCPConfig = {
      command: "npx -y @composio-core@latest",
      args: ["transport", "--sse", mcpUrl],
    };

    if (clientType === "claude") {
      let configDir;
      let configPath;

      if (os.platform() === "darwin") {
        configDir = path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Claude"
        );
        configPath = path.join(configDir, "claude_desktop_config.json");
      } else if (os.platform() === "win32") {
        configDir = path.join(process.env.APPDATA || "", "Claude");
        configPath = path.join(configDir, "claude_desktop_config.json");
      } else {
        console.log(
          chalk.yellow(
            "\n⚠️  Claude Desktop is not supported on this platform."
          )
        );
        return;
      }

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      let claudeConfig: ClaudeConfig = { mcpServers: {} };
      if (fs.existsSync(configPath)) {
        try {
          claudeConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        } catch (error) {
          console.log(chalk.yellow("⚠️  Creating new config file"));
        }
      }

      // Ensure mcpServers exists
      if (!claudeConfig.mcpServers) claudeConfig.mcpServers = {};

      // Update only the mcpServers entry
      claudeConfig.mcpServers[url] = config;

      fs.writeFileSync(configPath, JSON.stringify(claudeConfig, null, 2));

      console.log(chalk.green(`✅ Configuration saved to: ${configPath}`));
    } else if (clientType === "windsurf") {
      const configDir = path.join(os.homedir(), ".codeium", "windsurf");
      const configPath = path.join(configDir, "mcp_config.json");

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let windsurfConfig: WindsurfConfig = { mcpServers: {} };
      if (fs.existsSync(configPath)) {
        try {
          windsurfConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
          if (!windsurfConfig.mcpServers) windsurfConfig.mcpServers = {};
        } catch (error) {
          console.log(chalk.yellow("⚠️  Creating new config file"));
        }
      }

      windsurfConfig.mcpServers[url] = config;
      fs.writeFileSync(configPath, JSON.stringify(windsurfConfig, null, 2));
      console.log(chalk.green(`✅ Configuration saved to: ${configPath}`));
    }
  }
}
