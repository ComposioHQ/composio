import chalk from "chalk";
import { Command } from "commander";

import { getAPISDK } from "../sdk/utils/config";
import client from "../sdk/client/client";

// @ts-ignore
import resolvePackagePath from "resolve-package-path";
import fs from "fs";
import path from "path";
export default class AppsCommand {
  private program: Command;

  constructor(program: Command) {
    this.program = program;

    const command = this.program.command("apps");

    command
      .description("List all apps you have access to")
      .action(this.handleAction.bind(this));

    new AppUpdateCommand(command);
  }

  private async handleAction(options: { browser: boolean }): Promise<void> {
    getAPISDK();
    const { data, error } = await client.apps.getApps({});

    if (!!error) {
      console.log(chalk.red((error as any).message));
      return;
    }

    console.log("Here are the apps you have access to:");

    for (const app of data?.items || []) {
      console.log(app.key);
    }
  }
}

class AppUpdateCommand {
  private program: Command;
  constructor(program: Command) {
    this.program = program;

    this.program
      .command("update")
      .description("Update apps")
      .action(this.handleAction.bind(this));
  }

  async updateActionsAndAppList(
    appList: string,
    actionsList: string,
  ): Promise<void> {
    try {
      const constantPath = resolvePackagePath("composio-core", process.cwd());
      let constantFilePath = "";

      try {
        const fileNamePath = process.argv[1];
        // if ts-node is used then we need to update the constants file in the root folder
        // this will only work for the build
        if (fileNamePath.includes("cli/index.ts")) {
          constantFilePath = path.join(
            "/Users/himanshu/Desktop/composio/composio/js" as string,
            "./lib/src/constants.js",
          );
        } else {
          // if package is used then we need to update the constants file in the package folder
          constantFilePath = path.join(
            constantPath as string,
            "./lib/src/constants.js",
          );
        }
      } catch (e) {
        console.log(chalk.red("Error while updating constants file"));
        console.log(chalk.red((e as any).message));
      }

      const constantFile = fs.readFileSync(constantFilePath, "utf8");

      const updatedConstantFile = constantFile
        .replace(
          /\/\/ apps list start here[\s\S]*?\/\/ apps list end here/,
          `// apps list start here\n${appList}// apps list end here`,
        )
        .replace(
          /\/\/ actions list start here[\s\S]*?\/\/ actions list end here/,
          `// actions list start here\n    ${actionsList}\n    // actions list end here`,
        );

      fs.writeFileSync(constantFilePath, updatedConstantFile);

      console.log(
        chalk.green("Constants file updated successfully"),
        chalk.green(constantFilePath),
      );
    } catch (e) {
      console.log(chalk.red("Error while updating constants file"));
      console.log(chalk.red((e as any).message));
    }
  }

  async handleAction(): Promise<void> {
    getAPISDK();

    const appList = await client.apps
      .getApps({})
      .then(
        (res) =>
          res.data?.items
            .map((app) => `'${app.key.toUpperCase()}': '${app.key}'`)
            .join(",\n") || [],
      );
    // @ts-ignore
    const actionsList = await client.actionsV2
      .v2ListActions({})
      .then(
        (res) =>
          res.data?.items
            // @ts-ignore
            .map((action) => `'${action.enum}': '${action.enum}'`)
            .join(",\n") || [],
      );

    await this.updateActionsAndAppList(
      appList as string,
      actionsList as string,
    );
  }
}
