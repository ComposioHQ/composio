import chalk from "chalk";
import { Command } from "commander";
import client from "../sdk/client/client";
import { getOpenAPIClient } from "../sdk/utils/config";
import { ListActionsV2Data } from "../sdk/client";

export default class ActionCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("actions")
      .description("Composio Actions")
      .option(
        "-a, --apps <appName>",
        "List all actions for the given apps",
        (value, previous: string[]) => previous.concat([value]),
        []
      )
      .option(
        "--tags <tagName>",
        "List all actions for the given tags",
        (value, previous: string[]) => previous.concat([value]),
        []
      )
      .option(
        "--use-case <useCase>",
        "Search for actions based on the given use case"
      )
      .option("--limit <limit>", "Limit the number of actions to display")
      .option("--enabled", "Only show enabled actions")
      .action(this.handleAction.bind(this));
  }

  private async handleAction(options: {
    apps?: string[];
    tags?: string[];
    useCase?: string;
    limit?: number;
    enabled?: boolean;
  }): Promise<void> {
    getOpenAPIClient();
    const { apps = [], tags = [], useCase, limit, enabled } = options;
    if (apps.length === 0) {
      console.log(chalk.red("Please provide at least one app name"));
      return;
    }
    const data: ListActionsV2Data = {
      query: {
        apps: apps.join(","),
        ...(tags.length && { tags: tags.join(",") }),
        ...(limit && { limit }),
        ...(enabled && { showEnabledOnly: enabled }),
        ...(useCase && { useCase }),
      },
    };
    try {
      const response = await client.actionsV2.listActionsV2(data);
      if (response.data?.items.length === 0) {
        console.log(chalk.yellow("No actions found"));
        return;
      }
      console.log(chalk.green("Here are the actions for the app:"));
      console.log("");
      // render list
      const actions = response.data?.items || [];
      actions.forEach((action) => console.log(action.name));
    } catch (error) {
      console.log(chalk.red((error as Error)?.message));
      return;
    }
  }
}
