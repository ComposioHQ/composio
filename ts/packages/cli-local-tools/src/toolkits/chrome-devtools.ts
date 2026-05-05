import { z } from 'zod/v3';
import { runLocalCommand } from '../runtime';
import type {
  LocalCommandExecution,
  LocalExecutionContext,
  LocalExecutionResult,
  LocalToolkitDeclaration,
  LocalToolDeclaration,
} from '../types';

const CHROME_DEVTOOLS_MCP_VERSION = '0.24.0';
const COMMAND_TIMEOUT_MS = 180_000;

const cliOutput = z.object({
  ok: z.boolean(),
  commandName: z.string(),
  result: z.unknown().optional(),
  resultText: z.string().optional(),
  stdout: z.string(),
  stderr: z.string(),
});

const baseInput = z.object({
  debug: z.boolean().default(false).describe('Set DEBUG=* for the chrome-devtools command.'),
  sessionId: z
    .string()
    .optional()
    .describe('Optional upstream chrome-devtools CLI session id for isolated daemon state.'),
});

const pageId = z.number().int().nonnegative().describe('Page ID from LIST_PAGES.');
const uid = z.string().min(1).describe('Element uid from TAKE_SNAPSHOT.');

const npxArgs = [
  '-y',
  '--package',
  `chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION}`,
  'chrome-devtools',
];

const addOption = (args: string[], name: string, value: unknown): string[] => {
  if (value === undefined || value === null || value === '') return args;
  args.push(`--${name}`, String(value));
  return args;
};

const addBooleanFlag = (args: string[], name: string, value: unknown): string[] => {
  if (value === true) args.push(`--${name}`);
  return args;
};

const addBooleanOption = (args: string[], name: string, value: unknown): string[] => {
  if (value === true) args.push(`--${name}`);
  if (value === false) args.push(`--no-${name}`);
  return args;
};

const addRepeated = (args: string[], name: string, values: unknown): string[] => {
  if (!Array.isArray(values)) return args;
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    args.push(`--${name}`, String(value));
  }
  return args;
};

const extractJson = (text: string): unknown | undefined => {
  const candidates = [text.indexOf('{'), text.indexOf('[')].filter(index => index >= 0);
  if (!candidates.length) return undefined;

  const start = Math.min(...candidates);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }
    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1)) as unknown;
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
};

const parseChromeDevtoolsOutput = (
  commandName: string,
  stdout: string,
  stderr: string,
  parseJson: boolean
): LocalExecutionResult => {
  const trimmed = stdout.trim();
  const result = parseJson ? extractJson(trimmed) : undefined;
  return {
    ok: true,
    commandName,
    ...(result !== undefined ? { result } : {}),
    ...(result === undefined && trimmed ? { resultText: trimmed } : {}),
    stdout,
    stderr,
  };
};

const runChromeDevtools = async (
  commandName: string,
  commandArgs: ReadonlyArray<string>,
  input: Record<string, unknown>,
  context: LocalExecutionContext,
  options: { readonly json?: boolean } = { json: true }
): Promise<LocalExecutionResult> => {
  const args = [...npxArgs];
  addOption(args, 'sessionId', input.sessionId);
  args.push(commandName, ...commandArgs);
  if (options.json !== false) args.push('--output-format=json');
  const execution: LocalCommandExecution = {
    kind: 'command',
    command: 'npx',
    args,
    env: {
      CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
      ...(input.usageStatistics === true ? {} : { CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' }),
      ...(input.debug === true ? { DEBUG: '*' } : {}),
    },
    timeoutMs: COMMAND_TIMEOUT_MS,
  };
  const result = await runLocalCommand(execution, input, context);
  return parseChromeDevtoolsOutput(
    commandName,
    String(result.stdout ?? ''),
    String(result.stderr ?? ''),
    options.json !== false
  );
};

const commandTool = <TInput extends z.ZodTypeAny>(definition: {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inputParams: TInput;
  readonly command: string;
  readonly args: (input: z.infer<TInput>) => ReadonlyArray<string>;
  readonly json?: boolean;
}): LocalToolDeclaration<TInput> => ({
  slug: definition.slug,
  name: definition.name,
  description: definition.description,
  platforms: ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'],
  inputParams: definition.inputParams,
  outputParams: cliOutput,
  execution: {
    kind: 'native',
    readiness: {
      command: 'npx',
      args: npxArgs,
    },
    execute: (input, context) =>
      runChromeDevtools(
        definition.command,
        definition.args(input as z.infer<TInput>),
        input,
        context,
        { json: definition.json }
      ),
  },
});

export const chromeDevtoolsToolkit: LocalToolkitDeclaration = {
  slug: 'CHROME_DEVTOOLS',
  name: 'Chrome DevTools (local)',
  description:
    'Local Chrome automation and debugging tools backed by the official chrome-devtools-mcp package and its chrome-devtools CLI daemon.',
  platforms: ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'],
  source: {
    type: 'mcp',
    package: `chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION}`,
    repository: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    command: `npx -y --package chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION} chrome-devtools`,
  },
  setup: {
    install: `Requires Node.js/npm and a supported Chrome installation. Tools run via npx --package chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION} chrome-devtools.`,
    commandOverrides: [],
    notes: [
      'The upstream chrome-devtools CLI automatically starts and reuses a background chrome-devtools-mcp daemon for stateful browser sessions.',
      'Use START_DAEMON to configure headless/browserUrl/userDataDir before invoking page tools, or let the first tool auto-start the daemon with upstream defaults.',
      'Use STOP_DAEMON when finished to close the background MCP/browser process.',
      'Chrome DevTools MCP can inspect and modify browser contents; avoid using it on sensitive sessions.',
    ],
  },
  tools: [
    commandTool({
      slug: 'START_DAEMON',
      name: 'Start Chrome DevTools MCP daemon',
      description:
        'Start or restart the background chrome-devtools-mcp daemon and browser with optional launch settings.',
      inputParams: baseInput.extend({
        browserUrl: z
          .string()
          .optional()
          .describe('Connect to an existing debuggable Chrome URL, e.g. http://127.0.0.1:9222.'),
        wsEndpoint: z
          .string()
          .optional()
          .describe('Connect to an existing Chrome DevTools WebSocket endpoint.'),
        headless: z.boolean().optional().describe('Run Chrome headless. Upstream default is true.'),
        executablePath: z.string().optional().describe('Custom Chrome executable path.'),
        userDataDir: z.string().optional().describe('Chrome user data directory.'),
        channel: z
          .enum(['canary', 'dev', 'beta', 'stable'])
          .optional()
          .describe('Chrome release channel.'),
        isolated: z.boolean().optional().describe('Use an isolated temporary user data dir.'),
        acceptInsecureCerts: z
          .boolean()
          .optional()
          .describe('Ignore self-signed/expired certificate errors.'),
        proxyServer: z.string().optional().describe('Chrome proxy server setting.'),
        performanceCrux: z
          .boolean()
          .optional()
          .describe('Allow CrUX field data lookups for performance tools.'),
        usageStatistics: z
          .boolean()
          .optional()
          .describe('Allow Google usage statistics for the MCP server.'),
        slim: z.boolean().optional().describe('Expose the upstream slim tool set.'),
        categoryExtensions: z
          .boolean()
          .optional()
          .describe('Enable or disable Chrome extension tools in the upstream daemon.'),
      }),
      command: 'start',
      json: false,
      args: input => {
        const args: string[] = [];
        addOption(args, 'browserUrl', input.browserUrl);
        addOption(args, 'wsEndpoint', input.wsEndpoint);
        addBooleanOption(args, 'headless', input.headless);
        addOption(args, 'executablePath', input.executablePath);
        addOption(args, 'userDataDir', input.userDataDir);
        addOption(args, 'channel', input.channel);
        addBooleanOption(args, 'isolated', input.isolated);
        addBooleanFlag(args, 'acceptInsecureCerts', input.acceptInsecureCerts);
        addOption(args, 'proxyServer', input.proxyServer);
        addBooleanOption(args, 'performanceCrux', input.performanceCrux);
        addBooleanOption(args, 'usageStatistics', input.usageStatistics);
        addBooleanFlag(args, 'slim', input.slim);
        addBooleanOption(args, 'categoryExtensions', input.categoryExtensions);
        return args;
      },
    }),
    commandTool({
      slug: 'STOP_DAEMON',
      name: 'Stop Chrome DevTools MCP daemon',
      description: 'Stop the background chrome-devtools-mcp daemon/browser if running.',
      inputParams: baseInput,
      command: 'stop',
      json: false,
      args: () => [],
    }),
    commandTool({
      slug: 'STATUS_DAEMON',
      name: 'Get Chrome DevTools MCP daemon status',
      description: 'Check whether the chrome-devtools-mcp daemon is running.',
      inputParams: baseInput,
      command: 'status',
      json: false,
      args: () => [],
    }),
    commandTool({
      slug: 'LIST_PAGES',
      name: 'List Chrome pages',
      description: 'Get pages open in the browser controlled by Chrome DevTools MCP.',
      inputParams: baseInput,
      command: 'list_pages',
      args: () => [],
    }),
    commandTool({
      slug: 'NEW_PAGE',
      name: 'Open new Chrome page',
      description: 'Open a new Chrome tab and load a URL.',
      inputParams: baseInput.extend({
        url: z.string().url().describe('URL to load in a new page.'),
        background: z.boolean().optional().describe('Open in background.'),
        isolatedContext: z.string().optional().describe('Named isolated browser context.'),
        timeout: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Maximum wait time in milliseconds.'),
      }),
      command: 'new_page',
      args: input => {
        const args = [input.url];
        addBooleanFlag(args, 'background', input.background);
        addOption(args, 'isolatedContext', input.isolatedContext);
        addOption(args, 'timeout', input.timeout);
        return args;
      },
    }),
    commandTool({
      slug: 'NAVIGATE_PAGE',
      name: 'Navigate Chrome page',
      description: 'Navigate selected page by URL, back, forward, or reload.',
      inputParams: baseInput.extend({
        type: z.enum(['url', 'back', 'forward', 'reload']).optional().describe('Navigation type.'),
        url: z.string().optional().describe('Target URL for type=url.'),
        ignoreCache: z.boolean().optional().describe('Ignore cache on reload.'),
        handleBeforeUnload: z
          .enum(['accept', 'decline'])
          .optional()
          .describe('Handle beforeunload dialogs.'),
        initScript: z
          .string()
          .optional()
          .describe('Script to run before the next navigation document loads.'),
        timeout: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Maximum wait time in milliseconds.'),
      }),
      command: 'navigate_page',
      args: input => {
        const args: string[] = [];
        addOption(args, 'type', input.type);
        addOption(args, 'url', input.url);
        addBooleanFlag(args, 'ignoreCache', input.ignoreCache);
        addOption(args, 'handleBeforeUnload', input.handleBeforeUnload);
        addOption(args, 'initScript', input.initScript);
        addOption(args, 'timeout', input.timeout);
        return args;
      },
    }),
    commandTool({
      slug: 'SELECT_PAGE',
      name: 'Select Chrome page',
      description: 'Select a page as context for future Chrome DevTools tool calls.',
      inputParams: baseInput.extend({ pageId, bringToFront: z.boolean().optional() }),
      command: 'select_page',
      args: input => {
        const args = [String(input.pageId)];
        addBooleanFlag(args, 'bringToFront', input.bringToFront);
        return args;
      },
    }),
    commandTool({
      slug: 'CLOSE_PAGE',
      name: 'Close Chrome page',
      description: 'Close a page by ID. The last open page cannot be closed.',
      inputParams: baseInput.extend({ pageId }),
      command: 'close_page',
      args: input => [String(input.pageId)],
    }),
    commandTool({
      slug: 'TAKE_SNAPSHOT',
      name: 'Take Chrome accessibility snapshot',
      description:
        'Take a text snapshot of the selected page, including element uids for automation.',
      inputParams: baseInput.extend({
        filePath: z.string().optional().describe('Optional path to save the snapshot.'),
        verbose: z.boolean().optional().describe('Include all a11y tree details.'),
      }),
      command: 'take_snapshot',
      args: input => {
        const args: string[] = [];
        addOption(args, 'filePath', input.filePath);
        addBooleanFlag(args, 'verbose', input.verbose);
        return args;
      },
    }),
    commandTool({
      slug: 'TAKE_SCREENSHOT',
      name: 'Take Chrome screenshot',
      description: 'Take a screenshot of the selected page or element.',
      inputParams: baseInput.extend({
        filePath: z.string().optional(),
        format: z.enum(['png', 'jpeg', 'webp']).optional(),
        quality: z.number().min(0).max(100).optional(),
        fullPage: z.boolean().optional(),
        uid: z.string().optional(),
      }),
      command: 'take_screenshot',
      args: input => {
        const args: string[] = [];
        addOption(args, 'filePath', input.filePath);
        addOption(args, 'format', input.format);
        addOption(args, 'quality', input.quality);
        addBooleanFlag(args, 'fullPage', input.fullPage);
        addOption(args, 'uid', input.uid);
        return args;
      },
    }),
    commandTool({
      slug: 'EVALUATE_SCRIPT',
      name: 'Evaluate JavaScript in Chrome page',
      description:
        'Evaluate a JavaScript function in the selected page and return a JSON-serializable result.',
      inputParams: baseInput.extend({
        function: z.string().min(1).describe('Function declaration, e.g. () => document.title.'),
        args: z.array(z.unknown()).optional().describe('Arguments passed to the function.'),
        dialogAction: z
          .string()
          .optional()
          .describe('Dialog action: accept, dismiss, or prompt response.'),
      }),
      command: 'evaluate_script',
      args: input => {
        const args = [input.function];
        if (input.args !== undefined) addOption(args, 'args', JSON.stringify(input.args));
        addOption(args, 'dialogAction', input.dialogAction);
        return args;
      },
    }),
    commandTool({
      slug: 'LIST_CONSOLE_MESSAGES',
      name: 'List Chrome console messages',
      description: 'List console messages for the selected page since the last navigation.',
      inputParams: baseInput.extend({
        pageSize: z.number().int().positive().optional(),
        pageIdx: z.number().int().nonnegative().optional(),
        types: z.array(z.string()).optional(),
        includePreservedMessages: z.boolean().optional(),
      }),
      command: 'list_console_messages',
      args: input => {
        const args: string[] = [];
        addOption(args, 'pageSize', input.pageSize);
        addOption(args, 'pageIdx', input.pageIdx);
        addRepeated(args, 'types', input.types);
        addBooleanFlag(args, 'includePreservedMessages', input.includePreservedMessages);
        return args;
      },
    }),
    commandTool({
      slug: 'GET_CONSOLE_MESSAGE',
      name: 'Get Chrome console message',
      description: 'Get a console message by ID from LIST_CONSOLE_MESSAGES.',
      inputParams: baseInput.extend({ msgid: z.number().int().nonnegative() }),
      command: 'get_console_message',
      args: input => [String(input.msgid)],
    }),
    commandTool({
      slug: 'LIST_NETWORK_REQUESTS',
      name: 'List Chrome network requests',
      description: 'List network requests for the selected page since the last navigation.',
      inputParams: baseInput.extend({
        pageSize: z.number().int().positive().optional(),
        pageIdx: z.number().int().nonnegative().optional(),
        resourceTypes: z.array(z.string()).optional(),
        includePreservedRequests: z.boolean().optional(),
      }),
      command: 'list_network_requests',
      args: input => {
        const args: string[] = [];
        addOption(args, 'pageSize', input.pageSize);
        addOption(args, 'pageIdx', input.pageIdx);
        addRepeated(args, 'resourceTypes', input.resourceTypes);
        addBooleanFlag(args, 'includePreservedRequests', input.includePreservedRequests);
        return args;
      },
    }),
    commandTool({
      slug: 'GET_NETWORK_REQUEST',
      name: 'Get Chrome network request',
      description:
        'Get a selected or specific network request and optionally save bodies to files.',
      inputParams: baseInput.extend({
        reqid: z.number().int().nonnegative().optional(),
        requestFilePath: z.string().optional(),
        responseFilePath: z.string().optional(),
      }),
      command: 'get_network_request',
      args: input => {
        const args: string[] = [];
        addOption(args, 'reqid', input.reqid);
        addOption(args, 'requestFilePath', input.requestFilePath);
        addOption(args, 'responseFilePath', input.responseFilePath);
        return args;
      },
    }),
    commandTool({
      slug: 'CLICK',
      name: 'Click Chrome page element',
      description: 'Click an element by uid from TAKE_SNAPSHOT.',
      inputParams: baseInput.extend({
        uid,
        dblClick: z.boolean().optional(),
        includeSnapshot: z.boolean().optional(),
      }),
      command: 'click',
      args: input => {
        const args = [input.uid];
        addBooleanFlag(args, 'dblClick', input.dblClick);
        addBooleanFlag(args, 'includeSnapshot', input.includeSnapshot);
        return args;
      },
    }),
    commandTool({
      slug: 'FILL',
      name: 'Fill Chrome page field',
      description: 'Fill an input, textarea, or select element by uid from TAKE_SNAPSHOT.',
      inputParams: baseInput.extend({
        uid,
        value: z.string(),
        includeSnapshot: z.boolean().optional(),
      }),
      command: 'fill',
      args: input => {
        const args = [input.uid, input.value];
        addBooleanFlag(args, 'includeSnapshot', input.includeSnapshot);
        return args;
      },
    }),
    commandTool({
      slug: 'DRAG',
      name: 'Drag Chrome page element',
      description: 'Drag an element by uid onto another element by uid.',
      inputParams: baseInput.extend({
        from_uid: z.string().min(1).describe('Uid of the element to drag.'),
        to_uid: z.string().min(1).describe('Uid of the drop target element.'),
        includeSnapshot: z.boolean().optional(),
      }),
      command: 'drag',
      args: input => {
        const args = [input.from_uid, input.to_uid];
        addBooleanFlag(args, 'includeSnapshot', input.includeSnapshot);
        return args;
      },
    }),
    commandTool({
      slug: 'HANDLE_DIALOG',
      name: 'Handle Chrome dialog',
      description: 'Accept or dismiss a browser dialog, optionally providing prompt text.',
      inputParams: baseInput.extend({
        action: z.enum(['accept', 'dismiss']),
        promptText: z.string().optional(),
      }),
      command: 'handle_dialog',
      args: input => {
        const args = [input.action];
        addOption(args, 'promptText', input.promptText);
        return args;
      },
    }),
    commandTool({
      slug: 'HOVER',
      name: 'Hover Chrome page element',
      description: 'Hover an element by uid from TAKE_SNAPSHOT.',
      inputParams: baseInput.extend({ uid, includeSnapshot: z.boolean().optional() }),
      command: 'hover',
      args: input => {
        const args = [input.uid];
        addBooleanFlag(args, 'includeSnapshot', input.includeSnapshot);
        return args;
      },
    }),
    commandTool({
      slug: 'PRESS_KEY',
      name: 'Press key in Chrome page',
      description: 'Press a key or key combination in the selected page.',
      inputParams: baseInput.extend({
        key: z.string().min(1),
        includeSnapshot: z.boolean().optional(),
      }),
      command: 'press_key',
      args: input => {
        const args = [input.key];
        addBooleanFlag(args, 'includeSnapshot', input.includeSnapshot);
        return args;
      },
    }),
    commandTool({
      slug: 'TYPE_TEXT',
      name: 'Type text in Chrome page',
      description: 'Type text with the keyboard into the currently focused input.',
      inputParams: baseInput.extend({
        text: z.string(),
        submitKey: z
          .string()
          .optional()
          .describe('Optional key pressed after typing, e.g. Enter, Tab, Escape.'),
      }),
      command: 'type_text',
      args: input => {
        const args = [input.text];
        addOption(args, 'submitKey', input.submitKey);
        return args;
      },
    }),
    commandTool({
      slug: 'UPLOAD_FILE',
      name: 'Upload file in Chrome page',
      description: 'Upload a local file through a file input or element that opens a file chooser.',
      inputParams: baseInput.extend({
        uid,
        filePath: z.string().min(1),
        includeSnapshot: z.boolean().optional(),
      }),
      command: 'upload_file',
      args: input => {
        const args = [input.uid, input.filePath];
        addBooleanFlag(args, 'includeSnapshot', input.includeSnapshot);
        return args;
      },
    }),
    commandTool({
      slug: 'RESIZE_PAGE',
      name: 'Resize Chrome page',
      description: 'Resize the selected page window to specific dimensions.',
      inputParams: baseInput.extend({
        width: z.number().positive(),
        height: z.number().positive(),
      }),
      command: 'resize_page',
      args: input => [String(input.width), String(input.height)],
    }),
    commandTool({
      slug: 'EMULATE',
      name: 'Emulate Chrome page conditions',
      description:
        'Emulate color scheme, CPU/network throttling, geolocation, user agent, or viewport.',
      inputParams: baseInput.extend({
        colorScheme: z.enum(['dark', 'light', 'auto']).optional(),
        cpuThrottlingRate: z.number().positive().optional(),
        geolocation: z
          .string()
          .optional()
          .describe('Latitude/longitude as <latitude>x<longitude>, or omit to clear.'),
        networkConditions: z
          .enum(['Offline', 'Slow 3G', 'Fast 3G', 'Slow 4G', 'Fast 4G'])
          .optional(),
        userAgent: z.string().optional(),
        viewport: z
          .string()
          .optional()
          .describe('<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape].'),
      }),
      command: 'emulate',
      args: input => {
        const args: string[] = [];
        addOption(args, 'colorScheme', input.colorScheme);
        addOption(args, 'cpuThrottlingRate', input.cpuThrottlingRate);
        addOption(args, 'geolocation', input.geolocation);
        addOption(args, 'networkConditions', input.networkConditions);
        addOption(args, 'userAgent', input.userAgent);
        addOption(args, 'viewport', input.viewport);
        return args;
      },
    }),
    commandTool({
      slug: 'LIGHTHOUSE_AUDIT',
      name: 'Run Chrome Lighthouse audit',
      description:
        'Run an accessibility/SEO/best-practices/agentic-browsing Lighthouse audit on the selected page.',
      inputParams: baseInput.extend({
        mode: z.enum(['navigation', 'snapshot']).optional(),
        device: z.enum(['desktop', 'mobile']).optional(),
        outputDirPath: z.string().optional(),
      }),
      command: 'lighthouse_audit',
      args: input => {
        const args: string[] = [];
        addOption(args, 'mode', input.mode);
        addOption(args, 'device', input.device);
        addOption(args, 'outputDirPath', input.outputDirPath);
        return args;
      },
    }),
    commandTool({
      slug: 'PERFORMANCE_START_TRACE',
      name: 'Start Chrome performance trace',
      description: 'Start a Chrome DevTools performance trace on the selected page.',
      inputParams: baseInput.extend({
        reload: z.boolean().optional(),
        autoStop: z.boolean().optional(),
        filePath: z.string().optional(),
      }),
      command: 'performance_start_trace',
      args: input => {
        const args: string[] = [];
        addBooleanFlag(args, 'reload', input.reload);
        addBooleanFlag(args, 'autoStop', input.autoStop);
        addOption(args, 'filePath', input.filePath);
        return args;
      },
    }),
    commandTool({
      slug: 'PERFORMANCE_STOP_TRACE',
      name: 'Stop Chrome performance trace',
      description: 'Stop the active Chrome DevTools performance trace and return insights.',
      inputParams: baseInput.extend({ filePath: z.string().optional() }),
      command: 'performance_stop_trace',
      args: input => {
        const args: string[] = [];
        addOption(args, 'filePath', input.filePath);
        return args;
      },
    }),
    commandTool({
      slug: 'PERFORMANCE_ANALYZE_INSIGHT',
      name: 'Analyze Chrome performance insight',
      description:
        'Return detailed information for a specific performance insight from a trace result.',
      inputParams: baseInput.extend({
        insightSetId: z.string().min(1),
        insightName: z.string().min(1),
      }),
      command: 'performance_analyze_insight',
      args: input => [input.insightSetId, input.insightName],
    }),
    commandTool({
      slug: 'LIST_EXTENSIONS',
      name: 'List Chrome extensions',
      description: 'List Chrome extensions installed in the controlled browser.',
      inputParams: baseInput,
      command: 'list_extensions',
      args: () => [],
    }),
    commandTool({
      slug: 'INSTALL_EXTENSION',
      name: 'Install Chrome extension',
      description: 'Install an unpacked Chrome extension from an absolute local path.',
      inputParams: baseInput.extend({ path: z.string().min(1) }),
      command: 'install_extension',
      args: input => [input.path],
    }),
    commandTool({
      slug: 'RELOAD_EXTENSION',
      name: 'Reload Chrome extension',
      description: 'Reload an unpacked Chrome extension by extension id.',
      inputParams: baseInput.extend({ id: z.string().min(1) }),
      command: 'reload_extension',
      args: input => [input.id],
    }),
    commandTool({
      slug: 'TRIGGER_EXTENSION_ACTION',
      name: 'Trigger Chrome extension action',
      description: 'Trigger the default toolbar action for a Chrome extension by id.',
      inputParams: baseInput.extend({ id: z.string().min(1) }),
      command: 'trigger_extension_action',
      args: input => [input.id],
    }),
    commandTool({
      slug: 'UNINSTALL_EXTENSION',
      name: 'Uninstall Chrome extension',
      description: 'Uninstall a Chrome extension by extension id.',
      inputParams: baseInput.extend({ id: z.string().min(1) }),
      command: 'uninstall_extension',
      args: input => [input.id],
    }),
    commandTool({
      slug: 'TAKE_MEMORY_SNAPSHOT',
      name: 'Take Chrome memory snapshot',
      description:
        'Capture a heap snapshot of the selected page to a local file for memory analysis.',
      inputParams: baseInput.extend({ filePath: z.string().min(1) }),
      command: 'take_memory_snapshot',
      args: input => [input.filePath],
    }),
  ],
};
