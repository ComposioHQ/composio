/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";

import client from "../sdk/client/client";
import { getOpenAPIClient } from "../sdk/utils/config";
import { parseDate } from "./src/util";

export default class ConnectionsCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    const command = this.program.command("integrations");

    command
      .description("List all integrations you have created or connected")
      .option("-a, --active", "Show only active integrations")
      .option("-r, --remove <id>", "Remove an integration with the given id")
      .action(this.handleAction.bind(this));
  }

  private async handleAction(options: {
    active: boolean;
    remove: string;
  }): Promise<void> {
    getOpenAPIClient();
    const { data, error } = await client.appConnector.listAllConnectors({
      query: options.active ? { status: "ACTIVE" } : {},
      throwOnError: false,
    });

    if (error) {
      console.log(chalk.red((error as Error).message));
      return;
    }
    const removeIntegrationId = options.remove || "";

    if (removeIntegrationId) {
      console.log(
        chalk.yellow(`Removing integration with id ${removeIntegrationId}`)
      );

      const { error } = await client.appConnector.deleteConnector({
        path: {
          integrationId: removeIntegrationId,
        },
      });

      if (error) {
        console.log(chalk.red((error as Error).message));
        return;
      }

      console.log(
        chalk.green(
          `Integration with id ${removeIntegrationId} removed successfully!`
        )
      );
      return;
    }

    if (!data?.items) {
      console.log(chalk.red("No integrations found"));
      return;
    }
    for (const integration of data.items) {
      const typedIntegration = integration;
      console.log(chalk.cyan(`• ${chalk.bold("Id")}: ${typedIntegration.id}`));
      console.log(
        chalk.magenta(`  ${chalk.bold("App")}: ${typedIntegration.appName}`)
      );
      console.log(
        chalk.magenta(
          `  ${chalk.bold("Created At")}: ${parseDate(typedIntegration.createdAt as string)}`
        )
      );
    }
  }
}
