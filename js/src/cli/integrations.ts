import chalk from "chalk";
import { Command } from "commander";

import client from "../sdk/client/client";
import { getAPISDK } from "../sdk/utils/config";
import { parseDate } from "./src/util";

export default class ConnectionsCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    const command = this.program.command("integrations");

    command
      .description("List all integrations you created")
      .option("-a, --active", "Show only active integrations")
      .action(this.handleAction.bind(this));
  }

  private async handleAction(options: { active: boolean }): Promise<void> {
    getAPISDK();
    const { data, error } = await client.appConnector.listGlobalConnectors({
      query: options.active ? { status: "ACTIVE" } : {},
      throwOnError: false,
    });

    if (error) {
      console.log(chalk.red((error as any).message));
      return;
    }

    for (const integration of data?.items || []) {
      const typedIntegration = integration as Record<string, any>;
      console.log(chalk.cyan(`• ${chalk.bold("Id")}: ${typedIntegration.id}`));
      console.log(
        chalk.magenta(`  ${chalk.bold("App")}: ${typedIntegration.appName}`),
      );
      console.log(
        chalk.magenta(
          `  ${chalk.bold("Created At")}: ${parseDate(typedIntegration.createdAt)}`,
        ),
      );
      console.log(""); // Add an empty line for better readability between connections
    }
  }
}
