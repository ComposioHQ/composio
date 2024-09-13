import chalk from "chalk";
import { Command } from "commander";

import client from "../sdk/client/client";
import { getAPISDK } from "../sdk/utils/config";

export default class ConnectionsCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    const command = this.program.command("connections");

    command
      .description("List all connections you have access to")
      .option("-a, --active", "Show only active connections")
      .action(this.handleAction.bind(this));

    new ConnectionsGetCommand(command);
  }

  private async handleAction(options: { active: boolean }): Promise<void> {
    getAPISDK();
    const { data, error } = await client.connections.getConnections({
      query: options.active ? { status: "ACTIVE" } : {},
      throwOnError: false,
    });

    if (error) {
      console.log(chalk.red((error as any).message));
      return;
    }

    for (const connection of data?.items || []) {
      console.log(chalk.cyan(`• ${chalk.bold("Id")}: ${connection.id}`));
      console.log(
        chalk.magenta(`  ${chalk.bold("App")}: ${connection.appName}`),
      );
      console.log(
        chalk.yellow(`  ${chalk.bold("Status")}: ${connection.status}`),
      );
      console.log(""); // Add an empty line for better readability between connections
    }
  }
}

export class ConnectionsGetCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("get")
      .description("Get a connection by id")
      .argument("<id>", "Connection id")
      .action(this.handleAction.bind(this));
  }

  private async handleAction(id: string): Promise<void> {
    getAPISDK();
    const { data, error } = await client.connections.getConnection({
      path: { connectedAccountId: id },
      throwOnError: false,
    });

    if (error) {
      console.log(chalk.red((error as any).message));
      return;
    }

    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      console.log(
        `- ${chalk.cyan.bold(key)}: ${JSON.stringify(value, null, 2)}`,
      );
    }
  }
}
