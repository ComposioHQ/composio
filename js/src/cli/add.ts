/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import open from "open";
import { z } from "zod";
import { Composio } from "../sdk";
import { GetConnectorInfoResDTO, GetConnectorListResDTO } from "../sdk/client";
import { ZAuthMode } from "../sdk/types/integration";

type TInputField = {
  name: string;
  displayName?: string;
  display_name?: string;
  expected_from_customer?: boolean;
  required?: boolean;
  message_name?: string;
  type?: string;
};

type THandleActionOptions = {
  force?: boolean;
  skipDefaultConnector?: boolean;
  noBrowser?: boolean;
  integrationId?: string;
  authMode?: string;
  scope?: string[];
  label?: string[];
};

type TAuthScheme = {
  auth_mode: string;
  fields: TInputField[];
};

export default class AddCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("add")
      .description("Add a new app")
      .argument("<app-name>", "The name of the app")
      .option("-f, --force", "Force the connection setup")
      .option(
        "--skip-default-connector",
        "Skip the default connector auth prompt"
      )
      .option("-n, --no-browser", "Don't open browser for verifying connection")
      .option(
        "-i, --integration-id <id>",
        "Specify integration ID to use existing integration"
      )
      .option("-a, --auth-mode <mode>", "Specify auth mode for given app")
      .option(
        "-s, --scope <scope>",
        "Specify scopes for the connection",
        (value, previous: string[]) => previous.concat([value]),
        []
      )
      .option(
        "-l, --label <label>",
        "Labels for connected account",
        (value, previous: string[]) => previous.concat([value]),
        []
      )
      .action(this.handleAction.bind(this));
  }

  private async handleAction(
    appName: string,
    options: THandleActionOptions
  ): Promise<void> {
    const composioClient = new Composio({});
    let integration:
      | GetConnectorInfoResDTO
      | GetConnectorListResDTO
      | undefined;

    if (options.integrationId) {
      integration = await composioClient.integrations.get({
        integrationId: options.integrationId,
      });
    } else {
      integration = await composioClient.integrations.list({
        appName: appName.toLowerCase(),
      });
    }

    let firstIntegration: GetConnectorInfoResDTO | undefined;
    if (
      (integration as GetConnectorListResDTO)?.items?.length === 0 ||
      options.force ||
      options.skipDefaultConnector
    ) {
      const integrationResult = await this.createIntegration(
        appName,
        options.skipDefaultConnector,
        options.authMode,
        options
      );

      if (integrationResult) {
        firstIntegration =
          integrationResult as unknown as GetConnectorInfoResDTO;
      }
    } else {
      firstIntegration = integration as GetConnectorInfoResDTO;
    }
    if (!firstIntegration) {
      console.log(chalk.red("No integration found or created"));
      return;
    }

    const connection = await composioClient.connectedAccounts.list({
      integrationId: firstIntegration.id,
    });

    if (connection.items.length > 0 && !options.force) {
      await this.shouldForceConnectionSetup();
    }

    if (firstIntegration && firstIntegration.id) {
      await this.setupConnections(firstIntegration.id, options);
    } else {
      console.log(chalk.red("Integration ID is undefined"));
    }
  }

  async shouldForceConnectionSetup() {
    const prompt = inquirer.createPromptModule();
    const { shouldForce } = await prompt([
      {
        type: "confirm",
        name: "shouldForce",
        message:
          "A connection already exists. Do you want to force a new connection?",
        default: false,
      },
    ]);

    if (!shouldForce) {
      console.log(
        chalk.yellow("Operation cancelled. Existing connection will be used.")
      );
      process.exit(0);
    }
  }

  private async waitUntilConnected(
    connectedAccountId: string,
    timeout: number = 30000
  ): Promise<void> {
    const composioClient = new Composio({});
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
      `Connection did not become active within ${timeout / 1000} seconds`
    );
  }

  private async setupConnections(
    integrationId: string,
    options: Record<string, unknown>
  ): Promise<void> {
    const composioClient = new Composio({});
    const data = await composioClient.integrations.get({ integrationId });
    const { expectedInputFields } = data!;

    const config = await this.collectInputFields(
      expectedInputFields as unknown as TInputField[],
      true
    );

    if (options.scope) {
      config.scopes = (options.scope as string[]).join(",");
    }

    const connectionData = await composioClient.connectedAccounts.initiate({
      integrationId,
      connectionParams: config,
      labels: options.label as string[],
    });

    if (connectionData.connectionStatus === "ACTIVE") {
      console.log(chalk.green("Connection created successfully"));
    }

    if (connectionData.redirectUrl && !options.noBrowser) {
      console.log(
        chalk.white("Redirecting to the app"),
        chalk.blue(connectionData.redirectUrl)
      );
      open(connectionData.redirectUrl);

      await this.waitUntilConnected(connectionData.connectedAccountId);

      console.log(chalk.green("Connection is active"));
      process.exit(0);
    } else if (connectionData.redirectUrl && options.noBrowser) {
      console.log(
        chalk.white(
          "Please authenticate the app by visiting the following URL:"
        ),
        chalk.blue(connectionData.redirectUrl)
      );
      console.log(
        chalk.green("Waiting for the connection to become active...")
      );

      await this.waitUntilConnected(connectionData.connectedAccountId);

      console.log(chalk.green("Connection is active"));
      process.exit(0);
    }
  }

  private async createIntegration(
    appName: string,
    skipDefaultConnectorAuth: boolean = false,
    userAuthMode?: string,
    options?: THandleActionOptions
  ) {
    const composioClient = new Composio({});
    const app = await composioClient.apps.get({
      appKey: appName.toLowerCase(),
    });

    if (app.no_auth) {
      console.log(
        chalk.green(
          `The app '${appName}' does not require authentication. You can connect it directly.\n`
        )
      );
      process.exit(0);
    }

    const testConnectors = app.testConnectors || [];

    const config: Record<string, unknown> = {};
    let useComposioAuth = true;
    const authSchemeExpectOauth = ["bearer_token", "api_key", "basic"];
    if (
      !app.no_auth &&
      testConnectors.length > 0 &&
      !skipDefaultConnectorAuth &&
      testConnectors.find((connector) => connector.auth_mode === userAuthMode)
    ) {
      const prompt = inquirer.createPromptModule();
      const { doYouWantToUseComposioAuth } = await prompt({
        type: "confirm",
        name: "doYouWantToUseComposioAuth",
        message: "Do you want to use Composio Auth?",
      });
      useComposioAuth = doYouWantToUseComposioAuth;
    }

    if (skipDefaultConnectorAuth) {
      useComposioAuth = false;
    }

    const prompt = inquirer.createPromptModule();
    const { integrationName } = await prompt({
      type: "input",
      name: "integrationName",
      message: "Enter the Integration name",
    });

    if (!integrationName) {
      console.log(chalk.red("Integration name is required"));
      return null;
    }

    config.name = integrationName;
    const authSchema: string | undefined =
      userAuthMode ||
      (app.auth_schemes &&
        (app.auth_schemes[0]?.auth_mode as string | undefined));

    const authModes = (app.auth_schemes || []).reduce(
      (acc, scheme: Record<string, unknown>) => {
        acc[scheme.auth_mode as string] = scheme;
        return acc;
      },
      {}
    );

    if (
      authSchema &&
      typeof authSchema === "string" &&
      !authModes[authSchema]
    ) {
      console.log(
        chalk.red(
          `Invalid value for auth_mode, select from ${Object.keys(authModes)}`
        )
      );
      return null;
    }

    const selectedAuthMode = authSchema || Object.keys(authModes)[0];
    const selectedAuthScheme = authModes[selectedAuthMode];

    if (authSchemeExpectOauth.includes(selectedAuthMode.toLowerCase())) {
      return this.handleBasicAuth(
        app,
        selectedAuthMode,
        selectedAuthScheme as TAuthScheme,
        config,
        integrationName
      );
    }

    return this.handleOAuth(
      app,
      selectedAuthMode,
      selectedAuthScheme as TAuthScheme,
      config,
      integrationName,
      options?.noBrowser ?? false,
      options?.scope ?? [],
      useComposioAuth
    );
  }

  private async handleBasicAuth(
    app: Record<string, unknown>,
    authMode: string,
    authScheme: TAuthScheme,
    config: Record<string, unknown>,
    integrationName: string
  ) {
    const composioClient = new Composio({});
    const authConfig = await this.collectInputFields(authScheme.fields);

    const integration = await composioClient.integrations.create({
      appId: app.appId as string,
      authScheme: authMode as unknown as z.infer<typeof ZAuthMode>,
      useComposioAuth: false,
      name: integrationName,
      authConfig,
    });

    return integration;
  }

  private async handleOAuth(
    app: Record<string, unknown>,
    authMode: string,
    authScheme: TAuthScheme,
    config: Record<string, unknown>,
    integrationName: string,
    noBrowser: boolean,
    scopes: string[],
    useComposioAuth: boolean
  ) {
    if (useComposioAuth) {
      return this.setupIntegration(
        app as {
          appId: string;
        },
        authMode,
        useComposioAuth,
        {},
        integrationName
      );
    }

    const authConfig = await this.collectInputFields(
      authScheme.fields as TInputField[]
    );

    if (scopes) {
      authConfig.scopes = scopes.join(",");
    }

    return this.setupIntegration(
      app as {
        appId: string;
      },
      authMode,
      useComposioAuth,
      authConfig,
      integrationName
    );
  }

  async collectInputFields(
    fields: TInputField[],
    isConnection = false
  ): Promise<Record<string, unknown>> {
    const config: Record<string, unknown> = {};

    for (const field of fields) {
      if (field.expected_from_customer && !isConnection) {
        continue;
      }

      const prompt = inquirer.createPromptModule();
      const { [field.name]: value } = await prompt({
        type: "input",
        name: field.name,
        message: (field.displayName || field.display_name) as string,
      });

      if (value) {
        config[field.name] = value;
      }
    }

    return config;
  }

  async setupIntegration(
    app: {
      appId: string;
    },
    authMode: string,
    useComposioAuth: boolean,
    config: Record<string, unknown>,
    name: string
  ) {
    const composioClient = new Composio({});
    const integration = await composioClient.integrations.create({
      appId: app.appId,
      authScheme: authMode as unknown as z.infer<typeof ZAuthMode>,
      useComposioAuth,
      name,
      authConfig: config,
    });
    return integration;
  }
}
