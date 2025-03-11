/**
 * Custom argument parser to replace yargs
 */

export interface CommandOption {
  type: 'string' | 'boolean' | 'number';
  description: string;
  default?: string | boolean | number;
  required?: boolean;
  choices?: string[];
}

export interface CommandDefinition {
  name: string;
  description: string;
  options: Record<string, CommandOption>;
  positionals: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  handler: (args: Record<string, any>) => Promise<void> | void;
}

export class ArgParser {
  private commands: CommandDefinition[] = [];
  private helpText: string = '';
  private version: string = '1.0.0';

  constructor(
    private programName: string,
    private programDescription: string
  ) {
    this.generateHelpText();
  }

  /**
   * Register a command with the parser
   */
  command(command: CommandDefinition): ArgParser {
    this.commands.push(command);
    this.generateHelpText();
    return this;
  }

  /**
   * Set the version of the program
   */
  setVersion(version: string): ArgParser {
    this.version = version;
    return this;
  }

  /**
   * Generate help text for the program
   */
  private generateHelpText(): void {
    let text = `${this.programName} - ${this.programDescription}\n\n`;
    text += 'Usage:\n';

    if (this.commands.length > 0) {
      text += `  ${this.programName} <command> [options]\n\n`;
      text += 'Commands:\n';

      for (const cmd of this.commands) {
        text += `  ${cmd.name.padEnd(15)} ${cmd.description}\n`;
      }

      text += `\nRun \`${this.programName} <command> --help\` for more information on a command.\n`;
    } else {
      text += `  ${this.programName} [options]\n`;
    }

    this.helpText = text;
  }

  /**
   * Generate help text for a specific command
   */
  private generateCommandHelpText(command: CommandDefinition): string {
    let text = `${this.programName} ${command.name} - ${command.description}\n\n`;
    text += 'Usage:\n';

    let usage = `  ${this.programName} ${command.name}`;

    // Add positionals to usage
    for (const pos of command.positionals) {
      if (pos.required) {
        usage += ` <${pos.name}>`;
      } else {
        usage += ` [${pos.name}]`;
      }
    }

    // Add options placeholder if there are options
    if (Object.keys(command.options).length > 0) {
      usage += ' [options]';
    }

    text += `${usage}\n\n`;

    // Add positionals section if there are any
    if (command.positionals.length > 0) {
      text += 'Arguments:\n';
      for (const pos of command.positionals) {
        text += `  ${pos.name.padEnd(15)} ${pos.description}${pos.required ? ' (required)' : ''}\n`;
      }
      text += '\n';
    }

    // Add options section if there are any
    if (Object.keys(command.options).length > 0) {
      text += 'Options:\n';
      for (const [name, option] of Object.entries(command.options)) {
        let optionText = `  --${name.padEnd(13)} ${option.description}`;

        if (option.default !== undefined) {
          optionText += ` (default: ${option.default})`;
        }

        if (option.required) {
          optionText += ' (required)';
        }

        if (option.choices && option.choices.length > 0) {
          optionText += ` (choices: ${option.choices.join(', ')})`;
        }

        text += `${optionText}\n`;
      }
    }

    return text;
  }

  /**
   * Parse command line arguments and execute the appropriate command
   */
  async parse(args: string[] = process.argv.slice(2)): Promise<void> {
    // Handle --help and --version flags
    if (args.includes('--help') || args.includes('-h')) {
      if (args.length === 1 || (args.length === 2 && (args[0] === '--help' || args[0] === '-h'))) {
        console.log(this.helpText);
        return;
      }

      // Find command and show its help
      const cmdName = args[0] === '--help' || args[0] === '-h' ? args[1] : args[0];
      const command = this.commands.find(cmd => cmd.name === cmdName);

      if (command) {
        console.log(this.generateCommandHelpText(command));
      } else {
        console.log(`Unknown command: ${cmdName}`);
        console.log(this.helpText);
      }

      return;
    }

    if (args.includes('--version') || args.includes('-v')) {
      console.log(`${this.programName} v${this.version}`);
      return;
    }

    // No arguments provided
    if (args.length === 0) {
      console.log(this.helpText);
      return;
    }

    // Find the command
    const cmdName = args[0];
    const command = this.commands.find(cmd => cmd.name === cmdName);

    if (!command) {
      console.error(`Unknown command: ${cmdName}`);
      console.log(this.helpText);
      return;
    }

    // Parse arguments for the command
    const cmdArgs = args.slice(1);
    const parsedArgs: Record<string, any> = {};

    // Initialize defaults
    for (const [name, option] of Object.entries(command.options)) {
      if (option.default !== undefined) {
        parsedArgs[name] = option.default;
      }
    }

    // Parse positional arguments
    let positionalIndex = 0;
    for (let i = 0; i < cmdArgs.length; i++) {
      const arg = cmdArgs[i];

      // If it starts with -- or -, it's an option
      if (arg.startsWith('--') || (arg.startsWith('-') && arg.length === 2)) {
        const optName = arg.startsWith('--') ? arg.slice(2) : arg.slice(1);

        // Check if the option exists
        if (!command.options[optName]) {
          console.error(`Unknown option: ${arg}`);
          console.log(this.generateCommandHelpText(command));
          return;
        }

        // Boolean options don't need a value
        if (command.options[optName].type === 'boolean') {
          parsedArgs[optName] = true;
        } else {
          // Get the value for the option
          if (i + 1 >= cmdArgs.length || cmdArgs[i + 1].startsWith('-')) {
            console.error(`Option ${arg} requires a value`);
            return;
          }

          const value = cmdArgs[i + 1];
          i++; // Skip the value in the next iteration

          // Parse the value according to its type
          if (command.options[optName].type === 'number') {
            const numValue = Number(value);
            if (isNaN(numValue)) {
              console.error(`Option ${arg} requires a number value`);
              return;
            }
            parsedArgs[optName] = numValue;
          } else {
            // Check if the value is in the choices
            if (
              command.options[optName].choices &&
              !command.options[optName].choices.includes(value)
            ) {
              console.error(
                `Invalid value for option ${arg}. Valid choices: ${command.options[optName].choices!.join(', ')}`
              );
              return;
            }

            parsedArgs[optName] = value;
          }
        }
      } else {
        // It's a positional argument
        if (positionalIndex < command.positionals.length) {
          parsedArgs[command.positionals[positionalIndex].name] = arg;
          positionalIndex++;
        } else {
          console.error('Too many positional arguments');
          console.log(this.generateCommandHelpText(command));
          return;
        }
      }
    }

    // Check if all required options are provided
    for (const [name, option] of Object.entries(command.options)) {
      if (option.required && parsedArgs[name] === undefined) {
        console.error(`Required option --${name} is missing`);
        return;
      }
    }

    // Check if all required positionals are provided
    for (let i = 0; i < command.positionals.length; i++) {
      const pos = command.positionals[i];
      if (pos.required && parsedArgs[pos.name] === undefined) {
        console.error(`Required argument <${pos.name}> is missing`);
        console.log(this.generateCommandHelpText(command));
        return;
      }
    }

    // Execute the command handler
    try {
      await command.handler(parsedArgs);
    } catch (error) {
      console.error(`Error executing command ${command.name}:`, error);
    }
  }
}
