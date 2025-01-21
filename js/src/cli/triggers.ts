/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";
import client from "../sdk/client/client";

import inquirer from "inquirer";
import { Composio } from "../sdk";
import { getOpenAPIClient } from "../sdk/utils/config";

export default class ConnectionsCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    const command = this.program.command("triggers");
    command
      .description("Manage and list triggers")
      .option("--id <text>", "Filter by trigger id")
      .option("--app <text>", "Filter by app name")
      .option("--active", "Show only active triggers")
      .action(async (options) => {
        if (options.active) {
          // Run active triggers command if --active flag is present
          const activeTriggers = new ActiveTriggers(command, false);
          // @ts-ignore
          await activeTriggers.handleAction();
        } else {
          // Otherwise run normal list action
          await this.handleAction(options);
        }
      });

    command
      .command("list")
      .description("List all triggers")
      .action(this.handleAction.bind(this));

    new TriggerAdd(command);
    new TriggerDisable(command);
    new ActiveTriggers(command);
    new TriggerEnable(command);
    new TriggerCallback(command);
  }

  private async handleAction(options: {
    active: boolean;
    id: string;
    app: string;
  }): Promise<void> {
    const { active, id, app } = options;
    const client = getOpenAPIClient();
    const { data, error } = await client.triggers.listTriggers({
      query: {
        ...(!!active && { showEnabledOnly: true }),
        ...(!!app && { appNames: app }),
        ...(!!id && { triggerIds: id }),
      },

      throwOnError: false,
    });

    if (error) {
      console.log(chalk.red((error as Error).message));
      return;
    }

    if (!data) {
      console.log(chalk.red("No triggers found"));
      return;
    }

    for (const trigger of data) {
      const typedTrigger = trigger;
      console.log(
        chalk.cyan(`  ${chalk.bold("Name")}:`),
        chalk.white(typedTrigger.appName)
      );
      console.log(
        chalk.cyan(`  ${chalk.bold("Enum")}:`),
        // @ts-ignore - typedTrigger.enum is not defined in the type but exists in the API response
        chalk.white(typedTrigger.enum)
      );
      console.log(
        chalk.cyan(`  ${chalk.bold("Description")}:`),
        chalk.white(typedTrigger.description)
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
      .description("Add a new trigger")
      .argument("<trigger>", "The trigger name")
      .action(this.handleAction.bind(this));
  }

  async handleAction(triggerName: string): Promise<void> {
    const composioClient = new Composio({});

    const data = (await composioClient.triggers.list()).find(
      // @ts-ignore
      (trigger) => trigger.enum.toLowerCase() === triggerName.toLowerCase()
    );

    if (!data) {
      console.log(chalk.red(`Trigger ${triggerName} not found`));
      return;
    }

    const appName = data.appName;

    const connection = await composioClient
      .getEntity("default")
      .getConnection({ app: appName });

    if (!connection) {
      console.log(chalk.red(`Connection to app ${appName} not found`));
      console.log(
        `Connect to the app by running: ${chalk.cyan(`composio add ${appName}`)}`
      );
      return;
    }

    const dataConfig = data.config!;
    const properties = dataConfig.properties!;
    const requiredProperties = dataConfig.required! as string[];
    const configValue: Record<string, unknown> = {};

    for (const key in properties) {
      if (requiredProperties.includes(key)) {
        const prompt = inquirer.createPromptModule();
        const answer = await prompt([
          {
            type: "input",
            name: key,
            message: `Enter the value for ${key}`,
          },
        ]);

        configValue[key] = answer[key];
      }
    }

    const triggerSetupData = await composioClient.triggers.setup({
      connectedAccountId: connection.id,
      triggerName,
      config: configValue,
    });

    console.log(
      chalk.green(
        `Trigger ${triggerName} setup to app ${appName} with id ${triggerSetupData?.triggerId}`
      )
    );
  }
}

export class TriggerDisable {
  private program: Command;
  constructor(program: Command) {
    this.program = program;

    this.program
      .command("disable")
      .description("Disable an existing trigger")
      .argument("<triggerid>", "The trigger id")
      .action(this.handleAction.bind(this));
  }

  async handleAction(triggerId: string): Promise<void> {
    const composioClient = new Composio({});
    try {
      await composioClient.triggers.disable({ triggerId });
      console.log(chalk.green(`Trigger ${triggerId} disabled`));
    } catch (error) {
      console.log(chalk.red(`Error disabling trigger ${triggerId}: ${error}`));
    }
  }
}

export class TriggerEnable {
  private program: Command;
  constructor(program: Command) {
    this.program = program;

    this.program
      .command("enable")
      .description("Enable an existing trigger")
      .argument("<triggerid>", "The trigger id")
      .action(this.handleAction.bind(this));
  }

  async handleAction(triggerId: string): Promise<void> {
    const composioClient = new Composio({});
    try {
      await composioClient.triggers.enable({ triggerId });
      console.log(chalk.green(`Trigger ${triggerId} enabled`));
    } catch (error) {
      console.log(chalk.red(`Error enabling trigger ${triggerId}: ${error}`));
    }
  }
}

export class ActiveTriggers {
  private program: Command;
  constructor(program: Command, register: boolean = true) {
    this.program = program;

    if (register) {
      this.program
        .command("active")
        .description("Show list of currently active triggers")
        .action(this.handleAction.bind(this));
    }
  }

  async handleAction(): Promise<void> {
    const composioClient = new Composio({});
    const triggers = await composioClient.activeTriggers.list();
    for (const trigger of triggers) {
      console.log(`Id: ${chalk.bold(trigger.id)}`);
      console.log(`Trigger Name: ${chalk.cyan(trigger.triggerName)}`);
      console.log(
        `TriggerConfig: ${chalk.magenta(JSON.stringify(trigger.triggerConfig, null, 2))}`
      );
      console.log(`Connection ID: ${chalk.yellow(trigger.connectionId)}`);
      console.log(""); // Add an empty line for better readability between triggers
    }
  }
}

export class TriggerCallback {
  private program: Command;
  constructor(program: Command) {
    this.program = program;

    const callbackCommand = this.program
      .command("callback")
      .description("Manage trigger callback URLs");

    callbackCommand
      .command("set")
      .description("Set a callback URL for a trigger")
      .argument("<callbackURL>", "Callback URL that needs to be set")
      .action(this.handleSetAction.bind(this));

    callbackCommand
      .command("get")
      .description("Get the current callback URL for a trigger")
      .action(this.handleGetAction.bind(this));
  }

  async handleSetAction(callbackURL: string): Promise<void> {
    getOpenAPIClient();
    try {
      await client.triggers.setCallbackUrl({
        body: {
          callbackURL: callbackURL,
        },
      });
      console.log(chalk.green(`Callback URL set to ${callbackURL}`));
    } catch (error) {
      console.log(
        chalk.red(
          `Error setting callback URL to ${callbackURL}: ${(error as Error).message}`
        )
      );
    }
  }

  async handleGetAction(): Promise<void> {
    getOpenAPIClient();
    try {
      const res = await client.triggers.getWebhookUrl();
      console.log(
        chalk.green(`Current callback URL is ${res?.data?.callbackURL}`)
      );
    } catch (error) {
      console.log(
        chalk.red(`Error getting callback URL: ${(error as Error).message}`)
      );
    }
  }
}
