import { Command } from "commander";
import client from "../sdk/client/client";
import chalk from "chalk";
import { getOpenAPIClient } from "../sdk/utils/config";

export default class ExecuteCommand {
  private program: Command;
  constructor(program: Command) {
    this.program = program;
    this.program
      .command("execute <action>")
      .description("Execute a Composio action")
      .option("-p, --params <params>", "Action parameters as a JSON string")
      .action(this.handleAction.bind(this));
  }
  private async handleAction(
    action: string,
    options: {
      params?: string;
    }
  ): Promise<void> {
    getOpenAPIClient();
    const { params } = options;
    try {
      const res = await client.actionsV2.executeActionV2({
        body: params ? JSON.parse(params) : {},
        path: {
          actionId: action,
        },
      });
      console.log(
        chalk.green(
          "Action executed successfully",
          JSON.stringify(res?.data?.data, null, 2)
        )
      );
    } catch (error) {
      console.log(
        chalk.red(`Error executing action: ${(error as Error).message}`)
      );
      return;
    }
  }
}
