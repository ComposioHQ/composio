import chalk from "chalk";
import { Command } from "commander";

import { getAPISDK } from "../sdk/utils/config";
import { Composio } from "../sdk";
import inquirer from "inquirer";

export default class ConnectionsCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    const command = this.program.command("triggers");

    command
      .description("List all triggers you have access to")
      .option("--active", "Only list the active triggers")
      .option("--id <text>", "Filter by trigger id")
      .option("--app <text>", "Filter by app name")
      .action(this.handleAction.bind(this));

    new TriggerAdd(command);
    new TriggerDisable(command);
    new ActiveTriggers(command);
  }

  private async handleAction(options: {
    active: boolean;
    id: string;
    app: string;
  }): Promise<void> {
    const { active, id, app } = options;
    const client = getAPISDK();
    const { data, error } = await client.triggers.listTriggers({
      query: {
        ...(!!active && { showEnabledOnly: true }),
        ...(!!app && { appNames: app }),
        ...(!!id && { triggerIds: id }),
      },

      throwOnError: false,
    });

    if (error) {
      console.log(chalk.red((error as any).message));
      return;
    }

    for (const trigger of data || []) {
      const typedTrigger = trigger as any;
      console.log(
        chalk.cyan(`  ${chalk.bold("Name")}:`),
        chalk.white(typedTrigger.appName),
      );
      console.log(
        chalk.cyan(`  ${chalk.bold("Enum")}:`),
        chalk.white(typedTrigger.enum),
      );
      console.log(
        chalk.cyan(`  ${chalk.bold("Description")}:`),
        chalk.white(typedTrigger.description),
      );
      console.log(""); // Add an empty line for better readability between triggers
    }
  }
}

export class TriggerAdd {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    this.program
      .command("add")
      .description("Add a trigger")
      .argument("<trigger>", "The trigger name")
      .action(this.handleAction.bind(this));
  }

  async handleAction(triggerName: string): Promise<void> {
    const composioClient = new Composio();

    const data = (await composioClient.triggers.list()).find(
      // @ts-ignore
      (trigger) => trigger.enum.toLowerCase() === triggerName.toLowerCase(),
    );

    if (!data) {
      console.log(chalk.red(`Trigger ${triggerName} not found`));
      return;
    }

    const appName = data.appName;

    const connection = await composioClient
      .getEntity("default")
      .getConnection(appName);

    if (!connection) {
      console.log(chalk.red(`Connection to app ${appName} not found`));
      console.log(
        `Connect to the app by running: ${chalk.cyan(`composio add ${appName}`)}`,
      );
      return;
    }

    const properties = (data.config as any).properties as any;
    const requiredProperties = (data.config as any).required as string[];
    const configValue: any = {};

    for (const key in properties) {
      if (requiredProperties.includes(key)) {
        const answer = await inquirer.prompt([
          {
            type: "input",
            name: key,
            message: `Enter the value for ${key}`,
          },
        ]);

        configValue[key] = answer[key];
      }
    }

    await composioClient.triggers.setup(
      connection.id,
      triggerName,
      configValue,
    );

    console.log(chalk.green(`Trigger ${triggerName} setup to app ${appName}`));
  }
}

export class TriggerDisable {
  private program: Command;
  constructor(program: Command) {
    this.program = program;

    this.program
      .command("disable")
      .description("Disable a trigger")
      .argument("<triggerid>", "The trigger id")
      .action(this.handleAction.bind(this));
  }

  async handleAction(triggerId: string): Promise<void> {
    const composioClient = new Composio();
    try {
      await composioClient.triggers.disable({ triggerId });
      console.log(chalk.green(`Trigger ${triggerId} disabled`));
    } catch (error) {
      console.log(chalk.red(`Error disabling trigger ${triggerId}: ${error}`));
    }
  }
}

export class ActiveTriggers {
  private program: Command;
  constructor(program: Command) {
    this.program = program;

    this.program
      .command("active")
      .description("Disable a trigger")
      .action(this.handleAction.bind(this));
  }

  async handleAction(): Promise<void> {
    const composioClient = new Composio();
    const triggers = await composioClient.activeTriggers.list();
    for (const trigger of triggers) {
      console.log(`Id: ${chalk.bold(trigger.id)}`);
      console.log(`Trigger Name: ${chalk.cyan(trigger.triggerName)}`);
      console.log(
        `TriggerConfig: ${chalk.magenta(JSON.stringify(trigger.triggerConfig, null, 2))}`,
      );
      console.log(`Connection ID: ${chalk.yellow(trigger.connectionId)}`);
      console.log(""); // Add an empty line for better readability between triggers
    }
  }
}
