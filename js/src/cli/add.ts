import chalk from "chalk";
import { Command } from "commander";
import { Composio } from "../sdk";
import inquirer from "inquirer";
import open from "open";
import { GetConnectorListResDTO } from "../sdk/client";

export default class AddCommand {
  private program: Command;
  private composioClient: Composio;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("add")
      .description("Add a new app")
      .argument("<app-name>", "The name of the app")
      .option("-f, --force", "Force the connection setup")
      .action(this.handleAction.bind(this));

    this.composioClient = new Composio();
  }

  private async handleAction(
    appName: string,
    options: { force?: boolean },
  ): Promise<void> {
    let integration: GetConnectorListResDTO | undefined =
      await this.composioClient.integrations.list({
        // @ts-ignore
        appName: appName.toLowerCase(),
      });


    if (integration?.items.length === 0) {
      integration = (await this.createIntegration(
        appName,
      )) as GetConnectorListResDTO;
    }

    const firstIntegration = (integration as GetConnectorListResDTO)?.items[0];
    if (!firstIntegration) {
      console.log(chalk.red("No integration found or created"));
      return;
    }

    const connection = await this.composioClient.connectedAccounts.list({
      // @ts-ignore
      integrationId: firstIntegration.id,
    });

    if (connection.items.length > 0 && !options.force) {
      console.log(chalk.green("Connection already exists for", appName));
      return;
    }

    // @ts-ignore
    await this.setupConnections(firstIntegration.id);
  }

  private async waitUntilConnected(
    connectedAccountId: string,
    timeout: number = 30000,
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const data = (await this.composioClient.connectedAccounts.get({
          connectedAccountId: connectedAccountId,
        })) as { status: string };

        if (data.status === "ACTIVE") {
          return;
        }
      } catch (error) {
        console.error("Error checking connection status:", error);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Connection did not become active within ${timeout / 1000} seconds`,
    );
  }

  private async setupConnections(integrationId: string): Promise<void> {
    const data = await this.composioClient.integrations.get({ integrationId });
    const { expectedInputFields } = data;



    const config = await this.collectInputFields(expectedInputFields, true);

    const connectionData = await this.composioClient.connectedAccounts.create({
      integrationId,
      data: config,
    });

    if (connectionData.connectionStatus === "ACTIVE") {
      console.log(chalk.green("Connection created successfully"));
    }

    if (connectionData.redirectUrl) {
      console.log(
        chalk.white("Redirecting to the app"),
        chalk.blue(connectionData.redirectUrl),
      );
      open(connectionData.redirectUrl);

      await this.waitUntilConnected(connectionData.connectedAccountId);

      console.log(chalk.green("Connection is active"));
      process.exit(0);
    }
  }

  private async createIntegration(appName: string) {
    const app = await this.composioClient.apps.get({
      appKey: appName.toLowerCase(),
    });


    if (app.no_auth) {
        console.log(chalk.green(`The app '${appName}' does not require authentication. You can connect it directly.\n`));
        process.exit(0);
    }

    const config: Record<string, any> = {};

    const { integrationName } = await inquirer.prompt({
      type: "input",
      name: "integrationName",
      message: "Enter the app name",
    });

    if (!integrationName) {
      console.log(chalk.red("Integration name is required"));
      return null;
    }

    config.name = integrationName;
    // @ts-ignore
    const authSchema = app.auth_schemes[0]?.auth_mode;

    // @ts-ignore
    if (app?.testConnectors?.length > 0 || app.no_auth) {
      let useComposioAuth = false;
      if (!app.no_auth) {
        const { doYouWantToUseComposioAuth } = await inquirer.prompt({
          type: "confirm",
          name: "doYouWantToUseComposioAuth",
          message: "Do you want to use Composio Auth?",
        });
        useComposioAuth = doYouWantToUseComposioAuth;
      }

      config.useComposioAuth = useComposioAuth;
      return this.setupIntegration(app, authSchema, useComposioAuth, config);
    }


    const authConfig = await this.collectInputFields(
      // @ts-ignore
      app.auth_schemes[0].fields,
    );
    return this.setupIntegration(app, authSchema, false, authConfig);
  }

  async collectInputFields(
    fields: {
      name: string;
      displayName: string;
      display_name: string;
      expected_from_customer: boolean;
      required: boolean;
      type: string;
    }[],
    isConnection = false,
  ): Promise<Record<string, any>> {
    const config: Record<string, any> = {};

    for (const field of fields) {
      if (field.expected_from_customer && !isConnection) {
        continue;
      }

      const { [field.name]: value } = await inquirer.prompt({
        type: "input",
        name: field.name,
        message: field.displayName || field.display_name,
      });

      if (value) {
        config[field.name] = value;
      }
    }

    return config;
  }

  async setupIntegration(
    app: any,
    authMode: any,
    useComposioAuth: boolean,
    config: Record<string, any>,
  ) {
    await this.composioClient.integrations.create({
      appId: app.id,
      authScheme: authMode,
      useComposioAuth,

      authConfig: config,
    });

    return this.composioClient.integrations.list({
      // @ts-ignore
      appName: app.name.toLowerCase(),
    });
  }
}
