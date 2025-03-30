/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";

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

  private async handleAction(): Promise<void> {
    console.log(chalk.red("❌ Error: The 'mcp' command is deprecated"));
    console.log(chalk.yellow("Please use @composio/mcp instead:"));
    console.log(chalk.cyan("npx @composio/mcp --help"));
    return;
  }
}
