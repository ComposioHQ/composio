/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";
import { getSDKConfig } from "../sdk/utils/config";

export default class WhoamiCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("whoami")
      .description("Display current authentication information")
      .action(this.handleAction.bind(this));
  }

  private handleAction(): void {
    const { apiKey, baseURL } = getSDKConfig();

    if (!apiKey) {
      console.log(
        chalk.red(
          "You are not authenticated. Please run `composio login` to authenticate."
        )
      );
      return;
    }

    console.log(`\n🔑  API Key:  ${chalk.cyan(apiKey)}`);
    console.log(`🌐  Base URL: ${chalk.cyan(baseURL)}`);
    console.log(
      `${chalk.yellow("✨")} You are authenticated and ready to use Composio! ${chalk.yellow("✨")} \n`
    );
  }
}
