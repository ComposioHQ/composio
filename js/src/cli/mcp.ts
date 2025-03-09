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
      command: "npx",
      args: ["-y", "composio-core@rc", "transport", "--sse", mcpUrl],
    };

    const homeDir = os.homedir();

    const platformPaths = {
      win32: {
        baseDir:
          process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
        vscodePath: path.join("Code", "User", "globalStorage"),
      },
      darwin: {
        baseDir: path.join(homeDir, "Library", "Application Support"),
        vscodePath: path.join("Code", "User", "globalStorage"),
      },
      linux: {
        baseDir: process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config"),
        vscodePath: path.join("Code/User/globalStorage"),
      },
    };

    const platform = process.platform as keyof typeof platformPaths;

    // Check if platform is supported
    if (!platformPaths[platform]) {
      console.log(chalk.yellow(`\n⚠️ Platform ${platform} is not supported.`));
      return;
    }

    const { baseDir } = platformPaths[platform];

    // Define client paths using the platform-specific base directories
    const clientPaths: {
      [key: string]: { configDir: string; configPath: string };
    } = {
      claude: {
        configDir: path.join(baseDir, "Claude"),
        configPath: path.join(baseDir, "Claude", "claude_desktop_config.json"),
      },
      windsurf: {
        configDir: path.join(homeDir, ".codeium", "windsurf"),
        configPath: path.join(
          homeDir,
          ".codeium",
          "windsurf",
          "mcp_config.json"
        ),
      },
    };

    if (!clientPaths[clientType]) {
      console.log(chalk.yellow(`\n⚠️ Client ${clientType} is not supported.`));
      return;
    }

    const { configDir, configPath } = clientPaths[clientType];

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (clientType === "claude") {
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
