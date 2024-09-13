import whoami from "./whoami";
import login from "./login";
import logout from "./logout";
import apps from "./apps";
import connections from "./connections";
import integrations from "./integrations";
import triggers from "./triggers";
import add from "./add";

import { Command } from "commander";
import chalk from "chalk";

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
      formatLine(`    ${chalk.cyanBright(cmd.name())} - ${cmd.description()}`),
    ),
    formatLine(`    ${chalk.cyan("help")}   - Display help for command`),
    formatLine(""),
    formatLine(`  ${chalk.bold("⚙️ Options:")}\n`),
    formatLine(
      `    ${chalk.magenta("-V, --version")} 📌 Output the version number`,
    ),
    formatLine(
      `    ${chalk.magenta("-h, --help")}    ℹ️ Display help for command`,
    ),
    formatLine(""),
  ].join("\n");

  console.log(helpText);
  process.exit(0);
});

program.parse();
