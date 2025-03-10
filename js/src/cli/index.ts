/* eslint-disable no-console */
// Node Imports
import chalk from "chalk";
import { Command } from "commander";

// CLI Imports
import actions from "./actions";
import add from "./add";
import apps from "./apps";
import connections from "./connections";
import execute from "./execute";
import integrations from "./integrations";
import login from "./login";
import logout from "./logout";
import triggers from "./triggers";
import whoami from "./whoami";

// SDK Imports
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import mcpCommand from "./mcp";
import sseTransport from "./sseTransport";

const program = new Command().name("composio").description("Composio CLI");

// add whoami command
new whoami(program);
new login(program);
new logout(program);
new apps(program);
new connections(program);
new integrations(program);
new triggers(program);
new add(program);
new actions(program);
new execute(program);
new mcpCommand(program);
new sseTransport(program);

function formatLine(content: string): string {
  return `${content}`;
}

program.addHelpText("before", (options) => {
  const helpText = [
    formatLine(``),
    formatLine(`🚀 Composio CLI`),
    formatLine(""),
    formatLine(`  ${chalk.bold("📚 Commands:")}\n`),
    ...options.command.commands.map((cmd) =>
      formatLine(`    ${chalk.cyanBright(cmd.name())} - ${cmd.description()}`)
    ),
    formatLine(`    ${chalk.cyan("help")}   - Display help for command`),
    formatLine(""),
    formatLine(`  ${chalk.bold("⚙️ Options:")}\n`),
    formatLine(
      `    ${chalk.magenta("-h, --help")}    ℹ️ Display help for command`
    ),
    formatLine(""),
  ].join("\n");

  console.log(helpText);
  process.exit(0);
});

program.hook("preAction", () => {
  TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.CLI_INVOKED, {});
});

program.parse();
