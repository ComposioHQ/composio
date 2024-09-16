import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import open from "open";

import {
  getClientBaseConfig,
  getAPISDK,
  setCliConfig,
} from "../sdk/utils/config";
import client from "../sdk/client/client";
import { FRONTEND_BASE_URL } from "./src/constants";

export default class LoginCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("login")
      .option(
        "-n, --no-browser",
        "No browser will be opened, you will have to manually copy the link and paste it in your browser",
      )
      .description("Login to Composio")
      .action(this.handleAction.bind(this));
  }

  private async handleAction(options: { browser: boolean }): Promise<void> {
    getAPISDK();
    const { apiKey, baseURL } = getClientBaseConfig();

    if (apiKey) {
      console.log(
        chalk.yellow(
          "✨ You are already authenticated and ready to use Composio! ✨\n",
        ),
      );
      return;
    }

    const { data, error } = await client.cli.handleCliCodeExchange({});
    if (!!error) {
      console.log(chalk.red((error as any).message));
      return;
    }
    const cliKey = data?.key as string;
    const loginUrl = `${FRONTEND_BASE_URL}?cliKey=${cliKey}`;

    this.displayLoginInstructions(loginUrl, options.browser);
    const authCode = await this.promptForAuthCode();
    await this.verifyAndSetupCli(cliKey, authCode, baseURL);
  }

  private displayLoginInstructions(url: string, openBrowser: boolean): void {
    if (openBrowser) {
      open(url);
    }
    console.log("> Please login using the following link");
    console.log(chalk.cyan(url));
  }

  private async promptForAuthCode(): Promise<string> {
    const { authCode } = await inquirer.prompt({
      type: "input",
      name: "authCode",
      message: "Enter authentication code:",
    });
    return authCode;
  }

  private async verifyAndSetupCli(
    cliKey: string,
    authCode: string,
    baseURL: string,
  ): Promise<void> {
    const { data, error } = await client.cli.handleCliCodeVerification({
      query: { key: cliKey, code: authCode },
      throwOnError: false,
    });

    if (error) {
      throw new Error((error as any).message);
    }

    const apiKeyFromServer = data?.apiKey;
    setCliConfig(apiKeyFromServer as string, "");

    console.log(
      chalk.yellow("✨ You are authenticated and ready to use Composio! ✨\n"),
    );
  }
}
