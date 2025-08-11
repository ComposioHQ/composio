import type { CommandModule, ArgumentsCamelCase, Argv } from 'yargs';
import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { execFileSync } from 'child_process';

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

interface ClientConfig extends MCPConfig {
  [key: string]: any;
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
        describe: 'Client to use (claude, cline, roocode, windsurf, witsy, enconvo, cursor, vscode, vscode-insiders, boltai, amazon-bedrock, amazonq, librechat, gemini-cli)',
        default: 'claude',
        choices: ['claude', 'cline', 'roocode', 'windsurf', 'witsy', 'enconvo', 'cursor', 'vscode', 'vscode-insiders', 'boltai', 'amazon-bedrock', 'amazonq', 'librechat', 'gemini-cli'],
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
    args: ["-y", 'mcp-remote', mcpUrl],
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

  const defaultClaudePath = path.join(baseDir, 'Claude', 'claude_desktop_config.json');

  // Define client paths using the platform-specific base directories
  const clientPaths: {
    [key: string]: { type: 'file' | 'command' | 'yaml'; path?: string; command?: string };
  } = {
    claude: { 
      type: 'file', 
      path: defaultClaudePath 
    },
    cline: {
      type: 'file',
      path: path.join(baseDir, platformPaths[platform].vscodePath, 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    },
    roocode: {
      type: 'file',
      path: path.join(baseDir, platformPaths[platform].vscodePath, 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
    },
    windsurf: {
      type: 'file',
      path: path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json'),
    },
    witsy: { 
      type: 'file', 
      path: path.join(baseDir, 'Witsy', 'settings.json') 
    },
    enconvo: {
      type: 'file',
      path: path.join(homeDir, '.config', 'enconvo', 'mcp_config.json'),
    },
    cursor: { 
      type: 'file', 
      path: path.join(homeDir, '.cursor', 'mcp.json') 
    },
    vscode: {
      type: 'command',
      command: process.platform === 'win32' ? 'code.cmd' : 'code',
    },
    'vscode-insiders': {
      type: 'command',
      command: process.platform === 'win32' ? 'code-insiders.cmd' : 'code-insiders',
    },
    boltai: { 
      type: 'file', 
      path: path.join(homeDir, '.boltai', 'mcp.json') 
    },
    'amazon-bedrock': {
      type: 'file',
      path: path.join(homeDir, 'Amazon Bedrock Client', 'mcp_config.json'),
    },
    amazonq: {
      type: 'file',
      path: path.join(homeDir, '.aws', 'amazonq', 'mcp.json'),
    },
    librechat: {
      type: 'yaml',
      path: path.join(homeDir, 'LibreChat', 'librechat.yaml'),
    },
    'gemini-cli': {
      type: 'file',
      path: path.join(homeDir, '.gemini', 'settings.json'),
    },
  };

  if (!clientPaths[clientType]) {
    console.log(chalk.yellow(`\n⚠️ Client ${clientType} is not supported.`));
    return;
  }

  const clientConfig = clientPaths[clientType];
  const newKey = name || url.split('/').slice(3).join('/').replace(/\//g, '-');

  if (clientConfig.type === 'command') {
    handleCommandClient(clientConfig, newKey, config);
  } else if (clientConfig.type === 'yaml') {
    handleYamlClient(clientConfig, newKey, config);
  } else {
    handleFileClient(clientConfig, newKey, config, mcpUrl);
  }
}

function handleCommandClient(
  clientConfig: { command?: string },
  serverName: string,
  config: MCPConfig
): void {
  if (!clientConfig.command) {
    throw new Error('Command not specified for command-type client');
  }

  const args: string[] = [];
  args.push('--add-mcp', JSON.stringify({ ...config, name: serverName }));

  try {
    const output = execFileSync(clientConfig.command, args);
    console.log(chalk.green(`✅ Configuration added via ${clientConfig.command}: ${output.toString()}`));
  } catch (error) {
    if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Command '${clientConfig.command}' not found. Make sure ${clientConfig.command} is installed and on your PATH`
      );
    }
    throw error;
  }
}

function handleYamlClient(
  clientConfig: { path?: string },
  serverName: string,
  config: MCPConfig
): void {
  if (!clientConfig.path) {
    throw new Error('Path not specified for YAML client');
  }

  const configDir = path.dirname(clientConfig.path);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  let existingYaml: any = {};
  
  try {
    if (fs.existsSync(clientConfig.path)) {
      const originalContent = fs.readFileSync(clientConfig.path, 'utf8');
      existingYaml = yaml.load(originalContent) as any || {};
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Creating new YAML config file'));
  }

  // Initialize mcpServers if it doesn't exist
  if (!existingYaml.mcpServers) {
    existingYaml.mcpServers = {};
  }
  
  // Add the new server
  existingYaml.mcpServers[serverName] = config;
  
  // Write the updated YAML
  const yamlContent = yaml.dump(existingYaml, { 
    indent: 2,
    lineWidth: -1,
    noRefs: true
  });
  
  fs.writeFileSync(clientConfig.path, yamlContent);
  console.log(chalk.green(`✅ Configuration saved to: ${clientConfig.path}`));
}

function handleFileClient(
  clientConfig: { path?: string },
  serverName: string,
  config: MCPConfig,
  mcpUrl: string
): void {
  if (!clientConfig.path) {
    throw new Error('Path not specified for file client');
  }

  const configDir = path.dirname(clientConfig.path);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  let existingConfig: ClientConfig = { mcpServers: {} };
  
  try {
    if (fs.existsSync(clientConfig.path)) {
      existingConfig = JSON.parse(fs.readFileSync(clientConfig.path, 'utf8'));
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Creating new config file'));
  }

  // Ensure mcpServers exists
  if (!existingConfig.mcpServers) existingConfig.mcpServers = {};

  // Special handling for Cursor which uses SSE configuration
  if (clientConfig.path?.includes('.cursor')) {
    const sseConfig: MCPConfig = {
      url: mcpUrl,
    };
    existingConfig.mcpServers[serverName] = sseConfig;
  } else {
    existingConfig.mcpServers[serverName] = config;
  }

  fs.writeFileSync(clientConfig.path, JSON.stringify(existingConfig, null, 2));
  console.log(chalk.green(`✅ Configuration saved to: ${clientConfig.path}`));
}

export default command;
