import { z } from 'zod/v3';
import { runLocalCommand } from '../runtime';
import type {
  LocalCommandExecution,
  LocalExecutionContext,
  LocalExecutionResult,
  LocalToolkitDeclaration,
  LocalToolDeclaration,
} from '../types';

const PEEKABOO_VERSION = '3.0.0-beta4';
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
  verbose: z.boolean().default(false).describe('Enable verbose Peekaboo logging.'),
  noRemote: z
    .boolean()
    .default(false)
    .describe('Force local Peekaboo services and skip the XPC helper.'),
  logLevel: z
    .enum(['trace', 'verbose', 'debug', 'info', 'warning', 'error', 'critical'])
    .optional(),
  xpcService: z.string().optional().describe('Override Peekaboo XPC helper mach service name.'),
});

const targetInput = {
  app: z.string().optional().describe('Application name, bundle id, or PID:1234 target.'),
  pid: z.number().int().positive().optional().describe('Target application process id.'),
  windowTitle: z.string().optional().describe('Target window title.'),
  windowIndex: z.number().int().nonnegative().optional().describe('0-based target window index.'),
} as const;

const focusInput = {
  noAutoFocus: z.boolean().optional().describe('Disable automatic focus before interaction.'),
  spaceSwitch: z.boolean().optional().describe("Switch to the target window's Space if needed."),
  bringToCurrentSpace: z
    .boolean()
    .optional()
    .describe('Move target window to current Space instead.'),
  focusTimeoutSeconds: z.number().positive().optional(),
  focusRetryCountValue: z.number().int().nonnegative().optional(),
} as const;

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

const addOption = (args: string[], name: string, value: unknown): string[] => {
  if (value === undefined || value === null || value === '') return args;
  args.push(`--${name}`, String(value));
  return args;
};

const addBooleanFlag = (args: string[], name: string, value: unknown): string[] => {
  if (value === true) args.push(`--${name}`);
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

const addGlobalOptions = (args: string[], input: Record<string, unknown>, json: boolean) => {
  if (json) args.push('--json');
  addBooleanFlag(args, 'verbose', input.verbose);
  addBooleanFlag(args, 'no-remote', input.noRemote);
  addOption(args, 'log-level', input.logLevel);
  addOption(args, 'xpc-service', input.xpcService);
};

const addTargetOptions = (args: string[], input: Record<string, unknown>) => {
  addOption(args, 'app', input.app);
  addOption(args, 'pid', input.pid);
  addOption(args, 'window-title', input.windowTitle);
  addOption(args, 'window-index', input.windowIndex);
};

const addFocusOptions = (args: string[], input: Record<string, unknown>) => {
  addBooleanFlag(args, 'no-auto-focus', input.noAutoFocus);
  addBooleanFlag(args, 'space-switch', input.spaceSwitch);
  addBooleanFlag(args, 'bring-to-current-space', input.bringToCurrentSpace);
  addOption(args, 'focus-timeout-seconds', input.focusTimeoutSeconds);
  addOption(args, 'focus-retry-count-value', input.focusRetryCountValue);
};

const parsePeekabooOutput = (
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

const runPeekaboo = async (
  commandName: string,
  commandArgs: ReadonlyArray<string>,
  input: Record<string, unknown>,
  context: LocalExecutionContext,
  options: { readonly json?: boolean } = { json: true }
): Promise<LocalExecutionResult> => {
  const args = [...commandArgs];
  const parseJson = options.json !== false;
  addGlobalOptions(args, input, parseJson);
  const execution: LocalCommandExecution = {
    kind: 'command',
    command: { bundledBinary: 'peekaboo-cli', fallbackCommand: 'peekaboo' },
    args,
    timeoutMs: COMMAND_TIMEOUT_MS,
  };
  const result = await runLocalCommand(execution, input, context);
  return parsePeekabooOutput(
    commandName,
    String(result.stdout ?? ''),
    String(result.stderr ?? ''),
    parseJson
  );
};

const commandTool = <TInput extends z.ZodTypeAny>(definition: {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inputParams: TInput;
  readonly args: (input: z.infer<TInput>) => ReadonlyArray<string>;
  readonly json?: boolean;
}): LocalToolDeclaration<TInput> => ({
  slug: definition.slug,
  name: definition.name,
  description: definition.description,
  platforms: ['darwin-arm64'],
  inputParams: definition.inputParams,
  outputParams: cliOutput,
  execution: {
    kind: 'native',
    execute: (input, context) =>
      runPeekaboo(definition.slug, definition.args(input as z.infer<TInput>), input, context, {
        json: definition.json,
      }),
  },
});

const listDetails = z
  .array(z.enum(['bounds', 'ids', 'off_screen']))
  .optional()
  .describe('Window details to include when listing windows.');

export const peekabooToolkit: LocalToolkitDeclaration = {
  slug: 'PEEKABOO',
  name: 'Peekaboo (local)',
  description: 'Local macOS screen capture and GUI automation tools backed by the Peekaboo CLI.',
  platforms: ['darwin-arm64'],
  source: {
    type: 'cli',
    package: `@steipete/peekaboo@${PEEKABOO_VERSION}`,
    repository: 'https://github.com/steipete/Peekaboo',
    command: 'peekaboo',
  },
  bundledBinaries: [
    {
      id: 'peekaboo-cli',
      description: 'Peekaboo macOS automation CLI',
      targets: [
        {
          platforms: ['darwin-arm64'],
          path: 'peekaboo/darwin-arm64/peekaboo',
        },
      ],
    },
  ],
  setup: {
    install:
      'Requires macOS 15+, Screen Recording permission for capture/read tools, and Accessibility permission for click/type/window/menu automation. macOS Peekaboo binaries are generated for CLI release artifacts from the pinned upstream submodule; alternatively install with `brew install steipete/tap/peekaboo`.',
    commandOverrides: [],
    notes: [
      'Run PERMISSIONS_STATUS before UI automation and grant missing permissions in System Settings.',
      'Use SEE to capture a snapshot and element ids before CLICK, TYPE, SCROLL, MOVE, or DRAG.',
      'Most tools are one-shot CLI wrappers that return Peekaboo JSON output when upstream supports --json.',
      'Automation tools can control the local GUI; avoid sensitive screens unless intended.',
    ],
  },
  tools: [
    commandTool({
      slug: 'VERSION',
      name: 'Get Peekaboo version',
      description: 'Return the bundled or installed Peekaboo CLI version.',
      inputParams: baseInput,
      json: false,
      args: () => ['--version'],
    }),
    commandTool({
      slug: 'PERMISSIONS_STATUS',
      name: 'Check Peekaboo permissions',
      description: 'Check macOS Screen Recording, Accessibility, and Automation permissions.',
      inputParams: baseInput,
      args: () => ['permissions', 'status'],
    }),
    commandTool({
      slug: 'PERMISSIONS_GRANT',
      name: 'Show Peekaboo permission grant instructions',
      description: 'Return grant instructions for missing macOS permissions.',
      inputParams: baseInput,
      args: () => ['permissions', 'grant'],
    }),
    commandTool({
      slug: 'LIST_APPS',
      name: 'List running macOS apps',
      description: 'Enumerate running GUI applications with process and focus metadata.',
      inputParams: baseInput,
      args: () => ['list', 'apps'],
    }),
    commandTool({
      slug: 'LIST_WINDOWS',
      name: 'List macOS app windows',
      description: 'List windows for a target application with optional bounds/id details.',
      inputParams: baseInput.extend({
        app: z.string().min(1).describe('Application name, bundle id, or PID:1234.'),
        includeDetails: listDetails,
      }),
      args: input => {
        const args = ['list', 'windows'];
        addOption(args, 'app', input.app);
        if (input.includeDetails?.length)
          addOption(args, 'include-details', input.includeDetails.join(','));
        return args;
      },
    }),
    commandTool({
      slug: 'LIST_SCREENS',
      name: 'List macOS screens',
      description: 'List connected displays, resolution, scaling, and main/secondary state.',
      inputParams: baseInput,
      args: () => ['list', 'screens'],
    }),
    commandTool({
      slug: 'LIST_MENUBAR',
      name: 'List macOS menu bar items',
      description: 'List menu bar/status items and indices for menu-bar automation.',
      inputParams: baseInput,
      args: () => ['list', 'menubar'],
    }),
    commandTool({
      slug: 'LIST_PERMISSIONS',
      name: 'List Peekaboo permission status',
      description: 'List the same permission state exposed by `peekaboo list permissions`.',
      inputParams: baseInput,
      args: () => ['list', 'permissions'],
    }),
    commandTool({
      slug: 'TOOLS',
      name: 'List Peekaboo tool catalog',
      description: 'Return Peekaboo native/MCP tool catalog for discovery and auditing.',
      inputParams: baseInput.extend({ noSort: z.boolean().optional() }),
      args: input => {
        const args = ['tools'];
        addBooleanFlag(args, 'no-sort', input.noSort);
        return args;
      },
    }),
    commandTool({
      slug: 'SEE',
      name: 'Capture annotated UI snapshot',
      description:
        'Capture UI accessibility metadata and optional annotated screenshot for automation.',
      inputParams: baseInput.extend({
        app: z.string().optional(),
        pid: z.number().int().positive().optional(),
        windowTitle: z.string().optional(),
        mode: z.enum(['screen', 'window', 'frontmost']).optional(),
        path: z.string().optional(),
        captureEngine: z.enum(['auto', 'classic', 'cg', 'modern', 'sckit']).optional(),
        screenIndex: z.number().int().nonnegative().optional(),
        analyze: z.string().optional(),
        annotate: z.boolean().optional(),
      }),
      args: input => {
        const args = ['see'];
        addOption(args, 'app', input.app);
        addOption(args, 'pid', input.pid);
        addOption(args, 'window-title', input.windowTitle);
        addOption(args, 'mode', input.mode);
        addOption(args, 'path', input.path);
        addOption(args, 'capture-engine', input.captureEngine);
        addOption(args, 'screen-index', input.screenIndex);
        addOption(args, 'analyze', input.analyze);
        addBooleanFlag(args, 'annotate', input.annotate);
        return args;
      },
    }),
    commandTool({
      slug: 'IMAGE',
      name: 'Capture raw screenshot',
      description: 'Capture a screen/window/frontmost image and optionally save or analyze it.',
      inputParams: baseInput.extend({
        app: z.string().optional(),
        pid: z.number().int().positive().optional(),
        path: z.string().optional(),
        mode: z.enum(['auto', 'screen', 'window', 'frontmost']).optional(),
        windowTitle: z.string().optional(),
        windowIndex: z.number().int().nonnegative().optional(),
        screenIndex: z.number().int().nonnegative().optional(),
        format: z.enum(['png', 'jpg']).optional(),
        captureFocus: z.enum(['auto', 'background', 'foreground']).optional(),
        analyze: z.string().optional(),
        retina: z.boolean().optional(),
      }),
      args: input => {
        const args = ['image'];
        addOption(args, 'app', input.app);
        addOption(args, 'pid', input.pid);
        addOption(args, 'path', input.path);
        addOption(args, 'mode', input.mode);
        addOption(args, 'window-title', input.windowTitle);
        addOption(args, 'window-index', input.windowIndex);
        addOption(args, 'screen-index', input.screenIndex);
        addOption(args, 'format', input.format);
        addOption(args, 'capture-focus', input.captureFocus);
        addOption(args, 'analyze', input.analyze);
        addBooleanFlag(args, 'retina', input.retina);
        return args;
      },
    }),
    commandTool({
      slug: 'CLICK',
      name: 'Click UI element or coordinates',
      description: 'Click by fuzzy query, Peekaboo element id, or x,y coordinates.',
      inputParams: baseInput.extend({
        query: z.string().optional(),
        session: z.string().optional(),
        on: z.string().optional().describe('Element id from SEE.'),
        id: z.string().optional().describe('Alias for on.'),
        app: z.string().optional(),
        coords: z.string().optional().describe('Coordinates as x,y.'),
        waitFor: z.number().int().positive().optional(),
        double: z.boolean().optional(),
        right: z.boolean().optional(),
        ...focusInput,
      }),
      args: input => {
        const args = ['click'];
        if (input.query) args.push(input.query);
        addOption(args, 'session', input.session);
        addOption(args, 'on', input.on);
        addOption(args, 'id', input.id);
        addOption(args, 'app', input.app);
        addOption(args, 'coords', input.coords);
        addOption(args, 'wait-for', input.waitFor);
        addBooleanFlag(args, 'double', input.double);
        addBooleanFlag(args, 'right', input.right);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'TYPE',
      name: 'Type text or keyboard input',
      description: 'Type text, clear fields, and append return/tab/escape/delete key actions.',
      inputParams: baseInput.extend({
        text: z.string().optional(),
        session: z.string().optional(),
        delay: z.number().int().nonnegative().optional(),
        profile: z.enum(['human', 'linear']).optional(),
        wpm: z.number().int().min(80).max(220).optional(),
        tab: z.number().int().positive().optional(),
        app: z.string().optional(),
        return: z.boolean().optional(),
        escape: z.boolean().optional(),
        delete: z.boolean().optional(),
        clear: z.boolean().optional(),
        ...focusInput,
      }),
      args: input => {
        const args = ['type'];
        if (input.text) args.push(input.text);
        addOption(args, 'session', input.session);
        addOption(args, 'delay', input.delay);
        addOption(args, 'profile', input.profile);
        addOption(args, 'wpm', input.wpm);
        addOption(args, 'tab', input.tab);
        addOption(args, 'app', input.app);
        addBooleanFlag(args, 'return', input.return);
        addBooleanFlag(args, 'escape', input.escape);
        addBooleanFlag(args, 'delete', input.delete);
        addBooleanFlag(args, 'clear', input.clear);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'PRESS',
      name: 'Press special keys',
      description: 'Press one or more special keys such as return, tab, arrows, or function keys.',
      inputParams: baseInput.extend({
        keys: z.array(z.string().min(1)).min(1),
        count: z.number().int().positive().optional(),
        delay: z.number().int().nonnegative().optional(),
        hold: z.number().int().nonnegative().optional(),
        session: z.string().optional(),
        app: z.string().optional(),
        ...focusInput,
      }),
      args: input => {
        const args = ['press', ...input.keys];
        addOption(args, 'count', input.count);
        addOption(args, 'delay', input.delay);
        addOption(args, 'hold', input.hold);
        addOption(args, 'session', input.session);
        addOption(args, 'app', input.app);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'HOTKEY',
      name: 'Press key combination',
      description: 'Press modifier combos such as cmd,c or cmd,shift,t.',
      inputParams: baseInput.extend({
        keys: z.string().min(1).describe('Comma- or space-separated key combo.'),
        holdDuration: z.number().int().nonnegative().optional(),
        app: z.string().optional(),
        snapshot: z.string().optional(),
        ...focusInput,
      }),
      args: input => {
        const args = ['hotkey', input.keys];
        addOption(args, 'hold-duration', input.holdDuration);
        addOption(args, 'app', input.app);
        addOption(args, 'snapshot', input.snapshot);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'SCROLL',
      name: 'Scroll UI',
      description: 'Scroll up, down, left, or right at pointer position or a captured element.',
      inputParams: baseInput.extend({
        direction: z.enum(['up', 'down', 'left', 'right']),
        amount: z.number().int().positive().optional(),
        on: z.string().optional(),
        snapshot: z.string().optional(),
        app: z.string().optional(),
        delay: z.number().int().nonnegative().optional(),
        smooth: z.boolean().optional(),
        ...focusInput,
      }),
      args: input => {
        const args = ['scroll'];
        addOption(args, 'direction', input.direction);
        addOption(args, 'amount', input.amount);
        addOption(args, 'on', input.on);
        addOption(args, 'snapshot', input.snapshot);
        addOption(args, 'app', input.app);
        addOption(args, 'delay', input.delay);
        addBooleanFlag(args, 'smooth', input.smooth);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'MOVE',
      name: 'Move cursor',
      description: 'Move cursor to coordinates, element id/query, or screen center.',
      inputParams: baseInput.extend({
        coords: z.string().optional().describe('Coordinates as x,y.'),
        id: z.string().optional(),
        to: z.string().optional().describe('Fuzzy element query.'),
        center: z.boolean().optional(),
        snapshot: z.string().optional(),
        app: z.string().optional(),
        smooth: z.boolean().optional(),
        duration: z.number().int().nonnegative().optional(),
        steps: z.number().int().positive().optional(),
        profile: z.enum(['linear', 'human']).optional(),
        ...focusInput,
      }),
      args: input => {
        const args = ['move'];
        if (input.coords) args.push(input.coords);
        addOption(args, 'id', input.id);
        addOption(args, 'to', input.to);
        addBooleanFlag(args, 'center', input.center);
        addOption(args, 'snapshot', input.snapshot);
        addOption(args, 'app', input.app);
        addBooleanFlag(args, 'smooth', input.smooth);
        addOption(args, 'duration', input.duration);
        addOption(args, 'steps', input.steps);
        addOption(args, 'profile', input.profile);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'DRAG',
      name: 'Drag and drop',
      description: 'Drag from an element/coordinate to another element/coordinate or app.',
      inputParams: baseInput.extend({
        from: z.string().optional(),
        fromCoords: z.string().optional().describe('Start coordinates as x,y.'),
        to: z.string().optional(),
        toCoords: z.string().optional().describe('End coordinates as x,y.'),
        toApp: z.string().optional(),
        snapshot: z.string().optional(),
        app: z.string().optional(),
        duration: z.number().int().nonnegative().optional(),
        steps: z.number().int().positive().optional(),
        modifiers: z.string().optional().describe('Comma-separated modifiers such as cmd,shift.'),
        profile: z.enum(['linear', 'human']).optional(),
        ...focusInput,
      }),
      args: input => {
        const args = ['drag'];
        addOption(args, 'from', input.from);
        addOption(args, 'from-coords', input.fromCoords);
        addOption(args, 'to', input.to);
        addOption(args, 'to-coords', input.toCoords);
        addOption(args, 'to-app', input.toApp);
        addOption(args, 'snapshot', input.snapshot);
        addOption(args, 'app', input.app);
        addOption(args, 'duration', input.duration);
        addOption(args, 'steps', input.steps);
        addOption(args, 'modifiers', input.modifiers);
        addOption(args, 'profile', input.profile);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'APP_LAUNCH',
      name: 'Launch macOS app',
      description: 'Launch an app by name/path or bundle id and optionally open documents/URLs.',
      inputParams: baseInput.extend({
        app: z.string().optional(),
        bundleId: z.string().optional(),
        open: z.array(z.string()).optional(),
        waitUntilReady: z.boolean().optional(),
        noFocus: z.boolean().optional(),
      }),
      args: input => {
        const args = ['app', 'launch'];
        if (input.app) args.push(input.app);
        addOption(args, 'bundle-id', input.bundleId);
        addRepeated(args, 'open', input.open);
        addBooleanFlag(args, 'wait-until-ready', input.waitUntilReady);
        addBooleanFlag(args, 'no-focus', input.noFocus);
        return args;
      },
    }),
    commandTool({
      slug: 'APP_QUIT',
      name: 'Quit macOS app',
      description: 'Quit one target app or all regular apps with exclusions.',
      inputParams: baseInput.extend({
        app: z.string().optional(),
        pid: z.number().int().positive().optional(),
        all: z.boolean().optional(),
        except: z.string().optional().describe('Comma-separated app exclusions when all=true.'),
        force: z.boolean().optional(),
      }),
      args: input => {
        const args = ['app', 'quit'];
        addOption(args, 'app', input.app);
        addOption(args, 'pid', input.pid);
        addBooleanFlag(args, 'all', input.all);
        addOption(args, 'except', input.except);
        addBooleanFlag(args, 'force', input.force);
        return args;
      },
    }),
    commandTool({
      slug: 'APP_SWITCH',
      name: 'Switch macOS app',
      description: 'Activate a specific app or cycle with Cmd+Tab behavior.',
      inputParams: baseInput.extend({ to: z.string().optional(), cycle: z.boolean().optional() }),
      args: input => {
        const args = ['app', 'switch'];
        addOption(args, 'to', input.to);
        addBooleanFlag(args, 'cycle', input.cycle);
        return args;
      },
    }),
    commandTool({
      slug: 'WINDOW_FOCUS',
      name: 'Focus macOS window',
      description: 'Bring a target app/window to foreground with optional Space handling.',
      inputParams: baseInput.extend({ ...targetInput, ...focusInput }),
      args: input => {
        const args = ['window', 'focus'];
        addTargetOptions(args, input);
        addFocusOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'WINDOW_MOVE',
      name: 'Move macOS window',
      description: 'Move a target window to a new x,y origin.',
      inputParams: baseInput.extend({ ...targetInput, x: z.number(), y: z.number() }),
      args: input => {
        const args = ['window', 'move'];
        addTargetOptions(args, input);
        addOption(args, 'x', input.x);
        addOption(args, 'y', input.y);
        return args;
      },
    }),
    commandTool({
      slug: 'WINDOW_RESIZE',
      name: 'Resize macOS window',
      description: 'Resize a target window while keeping its origin.',
      inputParams: baseInput.extend({ ...targetInput, width: z.number(), height: z.number() }),
      args: input => {
        const args = ['window', 'resize'];
        addTargetOptions(args, input);
        addOption(args, 'width', input.width);
        addOption(args, 'height', input.height);
        return args;
      },
    }),
    commandTool({
      slug: 'WINDOW_SET_BOUNDS',
      name: 'Set macOS window bounds',
      description: 'Set target window origin and size in one operation.',
      inputParams: baseInput.extend({
        ...targetInput,
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      args: input => {
        const args = ['window', 'set-bounds'];
        addTargetOptions(args, input);
        addOption(args, 'x', input.x);
        addOption(args, 'y', input.y);
        addOption(args, 'width', input.width);
        addOption(args, 'height', input.height);
        return args;
      },
    }),
    ...(['close', 'minimize', 'maximize'] as const).map(action =>
      commandTool({
        slug: `WINDOW_${action.toUpperCase()}`,
        name: `${action[0]?.toUpperCase()}${action.slice(1)} macOS window`,
        description: `${action[0]?.toUpperCase()}${action.slice(1)} a target macOS window.`,
        inputParams: baseInput.extend(targetInput),
        args: input => {
          const args = ['window', action];
          addTargetOptions(args, input);
          return args;
        },
      })
    ),
    commandTool({
      slug: 'MENU_LIST',
      name: 'List app menus',
      description: 'List menu tree for a target app.',
      inputParams: baseInput.extend({ ...targetInput, includeDisabled: z.boolean().optional() }),
      args: input => {
        const args = ['menu', 'list'];
        addTargetOptions(args, input);
        addBooleanFlag(args, 'include-disabled', input.includeDisabled);
        return args;
      },
    }),
    commandTool({
      slug: 'MENU_CLICK',
      name: 'Click app menu item',
      description: 'Click an application menu item by item name or path such as File > Save.',
      inputParams: baseInput.extend({
        ...targetInput,
        ...focusInput,
        item: z.string().optional(),
        path: z.string().optional(),
      }),
      args: input => {
        const args = ['menu', 'click'];
        addTargetOptions(args, input);
        addFocusOptions(args, input);
        addOption(args, 'item', input.item);
        addOption(args, 'path', input.path);
        return args;
      },
    }),
    commandTool({
      slug: 'MENU_LIST_ALL',
      name: 'List frontmost menus and menu extras',
      description: 'Snapshot frontmost app menus and system menu extras.',
      inputParams: baseInput.extend({
        includeDisabled: z.boolean().optional(),
        includeFrames: z.boolean().optional(),
      }),
      args: input => {
        const args = ['menu', 'list-all'];
        addBooleanFlag(args, 'include-disabled', input.includeDisabled);
        addBooleanFlag(args, 'include-frames', input.includeFrames);
        return args;
      },
    }),
    commandTool({
      slug: 'CLIPBOARD',
      name: 'Read or write macOS clipboard',
      description: 'Get, set, clear, save, restore, or load macOS clipboard contents.',
      inputParams: baseInput.extend({
        action: z.enum(['get', 'set', 'clear', 'save', 'restore', 'load']),
        text: z.string().optional(),
        filePath: z.string().optional(),
        imagePath: z.string().optional(),
        dataBase64: z.string().optional(),
        uti: z.string().optional(),
        prefer: z.string().optional(),
        output: z.string().optional(),
        slot: z.string().optional(),
        alsoText: z.string().optional(),
        allowLarge: z.boolean().optional(),
        verify: z.boolean().optional(),
      }),
      args: input => {
        const args = ['clipboard'];
        addOption(args, 'action', input.action);
        addOption(args, 'text', input.text);
        addOption(args, 'file-path', input.filePath);
        addOption(args, 'image-path', input.imagePath);
        addOption(args, 'data-base64', input.dataBase64);
        addOption(args, 'uti', input.uti);
        addOption(args, 'prefer', input.prefer);
        addOption(args, 'output', input.output);
        addOption(args, 'slot', input.slot);
        addOption(args, 'also-text', input.alsoText);
        addBooleanFlag(args, 'allow-large', input.allowLarge);
        addBooleanFlag(args, 'verify', input.verify);
        return args;
      },
    }),
    commandTool({
      slug: 'APP_HIDE',
      name: 'Hide macOS app',
      description: 'Hide a target application.',
      inputParams: baseInput.extend({ app: z.string().min(1) }),
      args: input => ['app', 'hide', '--app', input.app],
    }),
    commandTool({
      slug: 'APP_UNHIDE',
      name: 'Unhide macOS app',
      description: 'Show/unhide a target application.',
      inputParams: baseInput.extend({ app: z.string().min(1) }),
      args: input => ['app', 'unhide', '--app', input.app],
    }),
    commandTool({
      slug: 'APP_RELAUNCH',
      name: 'Relaunch macOS app',
      description: 'Quit and relaunch a target application.',
      inputParams: baseInput.extend({
        app: z.string().min(1),
        wait: z.number().nonnegative().optional(),
        force: z.boolean().optional(),
        waitUntilReady: z.boolean().optional(),
      }),
      args: input => {
        const args = ['app', 'relaunch', input.app];
        addOption(args, 'wait', input.wait);
        addBooleanFlag(args, 'force', input.force);
        addBooleanFlag(args, 'wait-until-ready', input.waitUntilReady);
        return args;
      },
    }),
    commandTool({
      slug: 'DIALOG',
      name: 'Interact with system dialog',
      description: 'List, click, input into, select files for, or dismiss system dialogs.',
      inputParams: baseInput.extend({
        action: z.enum(['list', 'click', 'input', 'file', 'dismiss']),
        button: z.string().optional(),
        text: z.string().optional(),
        field: z.string().optional(),
        path: z.string().optional(),
        name: z.string().optional(),
        select: z.string().optional(),
        force: z.boolean().optional(),
      }),
      args: input => {
        const args = ['dialog', input.action];
        addOption(args, 'button', input.button);
        addOption(args, 'text', input.text);
        addOption(args, 'field', input.field);
        addOption(args, 'path', input.path);
        addOption(args, 'name', input.name);
        addOption(args, 'select', input.select);
        addBooleanFlag(args, 'force', input.force);
        return args;
      },
    }),
    commandTool({
      slug: 'DOCK',
      name: 'Interact with macOS Dock',
      description:
        'List Dock items, launch apps from Dock, right-click items, or show/hide the Dock.',
      inputParams: baseInput.extend({
        action: z.enum(['list', 'launch', 'right-click', 'hide', 'show']),
        app: z.string().optional(),
        select: z.string().optional(),
      }),
      args: input => {
        const args = ['dock', input.action];
        if (input.action === 'launch' && input.app) args.push(input.app);
        if (input.action !== 'launch') addOption(args, 'app', input.app);
        addOption(args, 'select', input.select);
        return args;
      },
    }),
    commandTool({
      slug: 'SPACE',
      name: 'Manage macOS Spaces',
      description: 'List Spaces, switch Spaces, or move windows between Spaces.',
      inputParams: baseInput.extend({
        action: z.enum(['list', 'switch', 'move-window']),
        to: z.number().int().positive().optional(),
        toCurrent: z.boolean().optional(),
        ...targetInput,
      }),
      args: input => {
        const args = ['space', input.action];
        addOption(args, 'to', input.to);
        addBooleanFlag(args, 'to-current', input.toCurrent);
        addTargetOptions(args, input);
        return args;
      },
    }),
    commandTool({
      slug: 'MENUBAR',
      name: 'Interact with macOS menu bar items',
      description: 'List or click status/menu-bar items by name or index.',
      inputParams: baseInput.extend({
        action: z.enum(['list', 'click']),
        itemName: z.string().optional(),
        index: z.number().int().nonnegative().optional(),
        includeRawDebug: z.boolean().optional(),
      }),
      args: input => {
        const args = ['menubar', input.action];
        if (input.itemName) args.push(input.itemName);
        addOption(args, 'index', input.index);
        addBooleanFlag(args, 'include-raw-debug', input.includeRawDebug);
        return args;
      },
    }),
    commandTool({
      slug: 'OPEN',
      name: 'Open URL or file',
      description: 'Open a URL or local file with its default or specified application.',
      inputParams: baseInput.extend({
        target: z.string().min(1),
        app: z.string().optional(),
        bundleId: z.string().optional(),
        waitUntilReady: z.boolean().optional(),
        noFocus: z.boolean().optional(),
      }),
      args: input => {
        const args = ['open', input.target];
        addOption(args, 'app', input.app);
        addOption(args, 'bundle-id', input.bundleId);
        addBooleanFlag(args, 'wait-until-ready', input.waitUntilReady);
        addBooleanFlag(args, 'no-focus', input.noFocus);
        return args;
      },
    }),
    commandTool({
      slug: 'SLEEP',
      name: 'Sleep in Peekaboo flow',
      description: 'Pause for a number of milliseconds between GUI actions.',
      inputParams: baseInput.extend({ duration: z.number().int().nonnegative() }),
      args: input => ['sleep', String(input.duration)],
    }),
    commandTool({
      slug: 'CLEAN',
      name: 'Clean Peekaboo caches',
      description: 'Prune Peekaboo session cache and temporary files.',
      inputParams: baseInput.extend({
        allSessions: z.boolean().optional(),
        olderThan: z
          .number()
          .positive()
          .optional()
          .describe('Remove sessions older than this many hours.'),
        session: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      args: input => {
        const args = ['clean'];
        addBooleanFlag(args, 'all-sessions', input.allSessions);
        addOption(args, 'older-than', input.olderThan);
        addOption(args, 'session', input.session);
        addBooleanFlag(args, 'dry-run', input.dryRun);
        return args;
      },
    }),
  ],
};
