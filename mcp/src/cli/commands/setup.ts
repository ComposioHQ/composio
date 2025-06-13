import type { CommandModule, ArgumentsCamelCase, Argv } from 'yargs';
import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface MCPArgs {
  url: string;
  client: string;
  name?: string;
}

interface MCPConfig {
  url?: string;
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
}

interface WindsurfConfig {
  mcpServers: {
    [key: string]: MCPConfig;
  };
}

interface ClaudeConfig {
  mcpServers: {
    [key: string]: MCPConfig;
  };
}

interface CursorConfig {
  mcpServers: {
    [key: string]: MCPConfig;
  };
}

type ErrorWithMessage = {
  message: string;
};

const command: CommandModule<{}, MCPArgs> = {
  command: 'setup <url> [name]',
  describe: 'Setup command for app integration',
  builder: (yargs: Argv<{}>): Argv<MCPArgs> => {
    return yargs
      .positional('url', {
        type: 'string',
        describe: 'The app to use',
        demandOption: true,
      })
      .option('client', {
        type: 'string',
        describe: 'Client to use (claude, windsurf, cursor)',
        default: 'claude',
        choices: ['claude', 'windsurf', 'cursor'],
      })
      .option('name', {
        type: 'string',
        describe: 'Name for the server',
      }) as Argv<MCPArgs>;
  },
  handler: async (argv: MCPArgs) => {
    const { url, client, name } = argv;
    const newKey = name || url.split('/').slice(3).join('/').replace(/\//g, '-');

    try {
      console.log(chalk.cyan('📝 Configuration Details:'));
      console.log(`   URL: ${chalk.green(url)}`);
      console.log(`   Client: ${chalk.green(client)}`);
      console.log(`   Name: ${chalk.green(newKey)}\n`);

      const mcpUrl = url;
      const command = `composio --sse "${mcpUrl}"`;

      console.log(chalk.cyan('💾 Saving configurations...'));

      saveMcpConfig(url, client, newKey, mcpUrl, command);

      console.log(
        chalk.cyan(`\n🚀 All done! Please restart ${client} for changes to take effect\n`)
      );
    } catch (error) {
      console.log(chalk.red('\n❌ Error occurred while setting up MCP:'));
      console.log(chalk.red(`   ${(error as ErrorWithMessage).message}`));
      console.log(chalk.yellow('\nPlease try again or contact support if the issue persists.\n'));
    }
  },
};

function saveMcpConfig(url: string, clientType: string, name: string, mcpUrl: string, command: string): void {
  const config: MCPConfig = {
    command: 'npx',
    args: ['@composio/mcp@latest', 'start', '--url', mcpUrl],
    env: {
      npm_config_yes: 'true',
    },
  };

  const sseConfig: MCPConfig = {
    url: mcpUrl,
  };

  const homeDir = os.homedir();

  const platformPaths = {
    win32: {
      baseDir: process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
      vscodePath: path.join('Code', 'User', 'globalStorage'),
    },
    darwin: {
      baseDir: path.join(homeDir, 'Library', 'Application Support'),
      vscodePath: path.join('Code', 'User', 'globalStorage'),
    },
    linux: {
      baseDir: process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'),
      vscodePath: path.join('Code/User/globalStorage'),
    },
  };

  const platform = process.platform as keyof typeof platformPaths;

  // Check if platform is supported
  if (!platformPaths[platform]) {
    console.log(chalk.yellow(`\n⚠️ Platform ${platform} is not supported.`));
    return;
  }

  const { baseDir } = platformPaths[platform];

  // Define client paths using the platform-specific base directories
  const clientPaths: {
    [key: string]: { configDir: string; configPath: string };
  } = {
    claude: {
      configDir: path.join(baseDir, 'Claude'),
      configPath: path.join(baseDir, 'Claude', 'claude_desktop_config.json'),
    },
    windsurf: {
      configDir: path.join(homeDir, '.codeium', 'windsurf'),
      configPath: path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json'),
    },
    cursor: {
      configDir: path.join(homeDir, '.cursor'),
      configPath: path.join(homeDir, '.cursor', 'mcp.json'),
    },
  };

  if (!clientPaths[clientType]) {
    console.log(chalk.yellow(`\n⚠️ Client ${clientType} is not supported.`));
    return;
  }

  const { configDir, configPath } = clientPaths[clientType];

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const newKey = name || url.split('/').slice(3).join('/').replace(/\//g, '-');

  if (clientType === 'claude') {
    let claudeConfig: ClaudeConfig = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      try {
        claudeConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (error) {
        console.log(chalk.yellow('⚠️  Creating new config file'));
      }
    }

    // Ensure mcpServers exists
    if (!claudeConfig.mcpServers) claudeConfig.mcpServers = {};

    // Update only the mcpServers entry
    claudeConfig.mcpServers[newKey] = config;

    fs.writeFileSync(configPath, JSON.stringify(claudeConfig, null, 2));

    console.log(chalk.green(`✅ Configuration saved to: ${configPath}`));
  } else if (clientType === 'windsurf') {
    let windsurfConfig: WindsurfConfig = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      try {
        windsurfConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!windsurfConfig.mcpServers) windsurfConfig.mcpServers = {};
      } catch (error) {
        console.log(chalk.yellow('⚠️  Creating new config file'));
      }
    }

    windsurfConfig.mcpServers[newKey] = config;
    fs.writeFileSync(configPath, JSON.stringify(windsurfConfig, null, 2));
    console.log(chalk.green(`✅ Configuration saved to: ${configPath}`));
  } else if (clientType === 'cursor') {
    let cursorConfig: CursorConfig = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      try {
        cursorConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!cursorConfig.mcpServers) cursorConfig.mcpServers = {};
      } catch (error) {
        console.log(chalk.yellow('⚠️  Creating new config file'));
      }
    }

    if (cursorConfig.mcpServers[newKey]) {
      delete cursorConfig.mcpServers[newKey];
    }

    try {

      cursorConfig.mcpServers[newKey] = sseConfig;
      fs.writeFileSync(configPath, JSON.stringify(cursorConfig, null, 2));
      console.log(chalk.green(`✅ Configuration saved to: ${configPath}`));
    } catch (error) {
      console.log(chalk.red('❌ Error occurred while setting up MCP:'));
      console.log(chalk.red(`   ${(error as ErrorWithMessage).message}`));
      console.log(chalk.yellow('\nPlease try again or contact support if the issue persists.\n'));
    }
  }
}

export default command;
