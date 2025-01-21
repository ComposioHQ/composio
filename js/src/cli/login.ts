/* eslint-disable no-console */
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import open from "open";

import client from "../sdk/client/client";
import { setCliConfig } from "../sdk/utils/cli";
import { getOpenAPIClient, getSDKConfig } from "../sdk/utils/config";
import { FRONTEND_BASE_URL } from "./src/constants";

export default class LoginCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
    this.program
      .command("login")
      .option(
        "-n, --no-browser",
        "No browser will be opened, you will have to manually copy the link and paste it in your browser"
      )
      .description("Authenticate and login to Composio")
      .action(this.handleAction.bind(this));
  }

  private async handleAction(options: { browser: boolean }): Promise<void> {
    getOpenAPIClient();
    const { apiKey, baseURL } = getSDKConfig();

    if (apiKey) {
      console.log(
        chalk.yellow(
          "✨ You are already authenticated and ready to use Composio! ✨\n"
        )
      );
      return;
    }
    try {
      const { data } = await client.cli.generateCliSession({
        query: {},
      });

      const cliKey = data?.key as string;
      const loginUrl = `${FRONTEND_BASE_URL}?cliKey=${cliKey}`;

      this.displayLoginInstructions(loginUrl, options.browser);
      const authCode = await this.promptForAuthCode();
      await this.verifyAndSetupCli(cliKey, authCode, baseURL);
    } catch (error) {
      console.log(chalk.red((error as Error).message));
      return;
    }
  }

  private displayLoginInstructions(url: string, openBrowser: boolean): void {
    if (openBrowser) {
      open(url);
    }
    console.log("> Please login using the following link");
    console.log(chalk.cyan(url));
  }

  private async promptForAuthCode(): Promise<string> {
    const prompt = inquirer.createPromptModule();
    const { authCode } = await prompt({
      type: "input",
      name: "authCode",
      message: "Enter authentication code:",
    });
    return authCode;
  }

  private async verifyAndSetupCli(
    cliKey: string,
    authCode: string,
    _baseURL: string
  ): Promise<void> {
    const { data, error } = await client.cli.verifyCliCode({
      query: { key: cliKey, code: authCode },
      throwOnError: false,
    });

    if (error) {
      throw new Error((error as Error).message);
    }

    const apiKeyFromServer = data?.apiKey;
    setCliConfig(apiKeyFromServer as string, "");

    console.log(
      chalk.yellow("✨ You are authenticated and ready to use Composio! ✨\n")
    );
  }
}
