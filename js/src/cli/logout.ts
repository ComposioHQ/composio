import chalk from "chalk";
import { Command } from "commander";
import { setCliConfig } from "../sdk/utils/config";

export default class LogoutCommand {
  constructor(private program: Command) {
    this.program
      .command("logout")
      .description("Clear authentication and logout from Composio")
      .action(this.handleAction.bind(this));
  }

  private handleAction(): void {
    setCliConfig("", "");
    console.log(chalk.yellow("✨ You have been logged out from Composio! ✨\n"));
  }
}
