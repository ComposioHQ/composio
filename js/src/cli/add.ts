import chalk from "chalk";
import { Command } from "commander";
import { Composio } from "../sdk";
import inquirer from "inquirer";
import open from "open";
import { GetConnectorListResDTO } from "../sdk/client";

export default class AddCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("add")
      .description("Add a new app")
      .argument("<app-name>", "The name of the app")
      .option("-f, --force", "Force the connection setup")
      .option("--skip-default-connector", "Skip the default connector auth prompt")
      .action(this.handleAction.bind(this));
  }

  private async handleAction(
    appName: string,
    options: { force?: boolean, skipDefaultConnector?: boolean },
  ): Promise<void> {
    const composioClient = new Composio();
    let integration: GetConnectorListResDTO | undefined =
      await composioClient.integrations.list({
        // @ts-ignore
        appName: appName.toLowerCase(),
      });

    let firstIntegration: GetConnectorListResDTO | undefined;
    if (integration?.items?.length === 0 || options.force || options.skipDefaultConnector) {
      firstIntegration = (await this.createIntegration(
        appName,
        options.skipDefaultConnector,
      )) as GetConnectorListResDTO;
    }else{
      firstIntegration = (integration as GetConnectorListResDTO)?.items[0] as GetConnectorListResDTO;
    }
    if (!firstIntegration) {
      console.log(chalk.red("No integration found or created"));
      return;
    }

    const connection = await composioClient.connectedAccounts.list({
      // @ts-ignore
      integrationId: firstIntegration.id,
    });

    if (connection.items.length > 0 && !options.force) {
      await this.shouldForceConnectionSetup()
    }

    // @ts-ignore
    await this.setupConnections(firstIntegration.id);
  }

  async shouldForceConnectionSetup() {
    const { shouldForce } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldForce',
        message: 'A connection already exists. Do you want to force a new connection?',
        default: false,
      },
    ]);

    if (!shouldForce) {
      console.log(chalk.yellow('Operation cancelled. Existing connection will be used.'));
      process.exit(0);
    }
  }

  private async waitUntilConnected(
    connectedAccountId: string,
    timeout: number = 30000,
  ): Promise<void> {
    const composioClient = new Composio();
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const data = (await composioClient.connectedAccounts.get({
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
    const composioClient = new Composio();
    const data = await composioClient.integrations.get({ integrationId });
    const { expectedInputFields } = data;


    const config = await this.collectInputFields(expectedInputFields, true);

    const connectionData = await composioClient.connectedAccounts.create({
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

  private async createIntegration(appName: string , skipDefaultConnectorAuth: boolean = false) {
    const composioClient = new Composio();
    const app = await composioClient.apps.get({
      appKey: appName.toLowerCase(),
    });

    if (app.no_auth) {
        console.log(chalk.green(`The app '${appName}' does not require authentication. You can connect it directly.\n`));
        process.exit(0);
    }

    const testConnectors = app.testConnectors || [];
  
    const config: Record<string, any> = {};

    let useComposioAuth = true;
    if (!app.no_auth && testConnectors.length > 0 && !skipDefaultConnectorAuth) {
      const { doYouWantToUseComposioAuth } = await inquirer.prompt({
        type: "confirm",
        name: "doYouWantToUseComposioAuth",
        message: "Do you want to use Composio Auth?",
      });
      useComposioAuth = doYouWantToUseComposioAuth;
    }

    if(skipDefaultConnectorAuth){
      useComposioAuth = false;
    }

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

    if (useComposioAuth) {
      useComposioAuth = true;
      return this.setupIntegration(app, authSchema, useComposioAuth, config, integrationName);
    }

    console.log("\n\nWe'll require you to enter the credentials for the app manually.\n\n");

    const authConfig = await this.collectInputFields(
      // @ts-ignore
      app.auth_schemes[0].fields,
    );
    return this.setupIntegration(app, authSchema, useComposioAuth, authConfig, integrationName);
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
    name: string,
  ) {
    const composioClient = new Composio();
    const integration = await composioClient.integrations.create({
      appId: app.appId,
      authScheme: authMode,
      useComposioAuth,
      name,
      authConfig: config,
    });
    

    return integration;
  }
}