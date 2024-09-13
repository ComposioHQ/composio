import chalk from "chalk";
import { Command } from "commander";
import { setCliConfig } from "../sdk/utils/config";

export default class LogoutCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("logout")
      .description("Logout from Composio")
      .action(this.handleAction.bind(this));
  }

  private handleAction(): void {
    setCliConfig("", "");
    console.log(
      chalk.yellow("✨ You have been logged out from Composio! ✨\n"),
    );
  }
}
