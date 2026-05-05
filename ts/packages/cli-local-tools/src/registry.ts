import zodToJsonSchema from 'zod-to-json-schema';
import { beeperImessageToolkit } from './toolkits/beeper-imessage';
import { chromeDevtoolsToolkit } from './toolkits/chrome-devtools';
import { peekabooToolkit } from './toolkits/peekaboo';
import type { z } from 'zod/v3';
import { formatSupportedPlatforms, detectCliPlatform, supportsCliPlatform } from './platform';
import { executeLocalTool } from './runtime';
import type {
  LocalCliPlatform,
  LocalToolkitDeclaration,
  LocalToolDeclaration,
  LocalToolResolution,
  LocalToolRouterExperimentalPayload,
} from './types';

export const LOCAL_TOOL_PREFIX = 'LOCAL_';

interface LocalCustomTool {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
}

interface LocalCustomToolkit {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly tools: ReadonlyArray<LocalCustomTool>;
}

/**
 * Built-in local toolkits shipped with @composio/cli-local-tools.
 *
 * The foundation package intentionally starts empty. Concrete integrations are
 * added in separate stack PRs so each app can be reviewed and validated on its
 * own.
 */
export const localToolkitDeclarations: ReadonlyArray<LocalToolkitDeclaration> = [
  beeperImessageToolkit,
  chromeDevtoolsToolkit,
  peekabooToolkit,
];

const normalizeSegment = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeLocalToolSlug = (toolSlug: string, toolkitSlug?: string): string =>
  toolkitSlug
    ? `${LOCAL_TOOL_PREFIX}${normalizeSegment(toolkitSlug)}_${normalizeSegment(toolSlug)}`
    : `${LOCAL_TOOL_PREFIX}${normalizeSegment(toolSlug)}`;

const descriptionWithPlatform = (
  description: string,
  platforms: ReadonlyArray<LocalCliPlatform>
): string => `${description}\n\nLocal CLI platforms: ${formatSupportedPlatforms(platforms)}.`;

const zodObjectToJsonSchema = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const converted = zodToJsonSchema(schema, { name: 'input' }) as {
    definitions?: { input?: Record<string, unknown> };
  } & Record<string, unknown>;
  const inputDefinition = converted.definitions?.input ?? converted;
  return {
    type: 'object',
    properties:
      inputDefinition.properties && typeof inputDefinition.properties === 'object'
        ? (inputDefinition.properties as Record<string, unknown>)
        : {},
    ...(Array.isArray(inputDefinition.required) ? { required: inputDefinition.required } : {}),
  };
};

const zodToOutputJsonSchema = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const converted = zodToJsonSchema(schema, { name: 'output' }) as {
    definitions?: { output?: Record<string, unknown> };
  } & Record<string, unknown>;
  return converted.definitions?.output ?? converted;
};

const toCustomTool = (
  toolkit: LocalToolkitDeclaration,
  tool: LocalToolDeclaration
): LocalCustomTool => ({
  slug: tool.slug,
  name: tool.name,
  description: descriptionWithPlatform(tool.description, tool.platforms),
  inputSchema: zodObjectToJsonSchema(tool.inputParams as z.ZodTypeAny),
  ...(tool.outputParams ? { outputSchema: zodToOutputJsonSchema(tool.outputParams) } : {}),
});

const toCustomToolkit = (
  toolkit: LocalToolkitDeclaration,
  tools: ReadonlyArray<LocalCustomTool>
): LocalCustomToolkit => ({
  slug: toolkit.slug,
  name: toolkit.name,
  description: descriptionWithPlatform(toolkit.description, toolkit.platforms),
  tools,
});

const toolkitMatchesFilter = (
  toolkit: LocalToolkitDeclaration,
  requestedToolkits?: ReadonlyArray<string>
): boolean => {
  if (!requestedToolkits || requestedToolkits.length === 0) return true;
  const requested = new Set(requestedToolkits.map(slug => slug.toLowerCase()));
  return requested.has(toolkit.slug.toLowerCase());
};

const declarationsFor = (
  declarations: ReadonlyArray<LocalToolkitDeclaration> | undefined
): ReadonlyArray<LocalToolkitDeclaration> => declarations ?? localToolkitDeclarations;

export const getAllLocalToolkitSlugs = (
  options: {
    readonly declarations?: ReadonlyArray<LocalToolkitDeclaration>;
  } = {}
): ReadonlyArray<string> =>
  declarationsFor(options.declarations).map(toolkit => toolkit.slug.toLowerCase());

export const isLocalToolkitSlug = (
  toolkitSlug: string | undefined,
  options: { readonly declarations?: ReadonlyArray<LocalToolkitDeclaration> } = {}
): boolean => {
  if (!toolkitSlug) return false;
  const lower = toolkitSlug.toLowerCase();
  return getAllLocalToolkitSlugs(options).includes(lower);
};

export const isLocalToolSlug = (
  toolSlug: string,
  options: { readonly declarations?: ReadonlyArray<LocalToolkitDeclaration> } = {}
): boolean => {
  const upper = toolSlug.toUpperCase();
  if (!upper.startsWith(LOCAL_TOOL_PREFIX)) return false;
  return (
    resolveLocalTool(toolSlug, { includeUnsupported: true, declarations: options.declarations }) !==
    null
  );
};

export const getLocalToolkitDeclarations = (
  options: {
    readonly currentPlatform?: LocalCliPlatform;
    readonly toolkits?: ReadonlyArray<string>;
    readonly declarations?: ReadonlyArray<LocalToolkitDeclaration>;
  } = {}
): ReadonlyArray<LocalToolkitDeclaration> => {
  const currentPlatform = options.currentPlatform ?? detectCliPlatform();
  return declarationsFor(options.declarations)
    .filter(toolkit => toolkitMatchesFilter(toolkit, options.toolkits))
    .filter(toolkit => supportsCliPlatform(toolkit.platforms, currentPlatform))
    .map(toolkit => ({
      ...toolkit,
      tools: toolkit.tools.filter(tool => supportsCliPlatform(tool.platforms, currentPlatform)),
    }))
    .filter(toolkit => toolkit.tools.length > 0);
};

export const getLocalCustomToolkits = (
  options: {
    readonly currentPlatform?: LocalCliPlatform;
    readonly toolkits?: ReadonlyArray<string>;
    readonly declarations?: ReadonlyArray<LocalToolkitDeclaration>;
  } = {}
): ReadonlyArray<LocalCustomToolkit> =>
  getLocalToolkitDeclarations(options).map(toolkit =>
    toCustomToolkit(
      toolkit,
      toolkit.tools.map(tool => toCustomTool(toolkit, tool))
    )
  );

const customToolkitToPayload = (
  toolkit: LocalCustomToolkit
): NonNullable<LocalToolRouterExperimentalPayload['custom_toolkits']>[number] => ({
  slug: toolkit.slug,
  name: toolkit.name,
  description: toolkit.description,
  tools: toolkit.tools.map(tool => ({
    slug: tool.slug,
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
    ...(tool.outputSchema ? { output_schema: tool.outputSchema } : {}),
  })),
});

export const createLocalToolRouterExperimentalPayload = (
  options: {
    readonly currentPlatform?: LocalCliPlatform;
    readonly toolkits?: ReadonlyArray<string>;
    readonly declarations?: ReadonlyArray<LocalToolkitDeclaration>;
  } = {}
): LocalToolRouterExperimentalPayload | undefined => {
  const customToolkits = getLocalCustomToolkits(options).map(customToolkitToPayload);
  if (customToolkits.length === 0) return undefined;
  return { custom_toolkits: customToolkits };
};

export const resolveLocalTool = (
  slug: string,
  options: {
    readonly currentPlatform?: LocalCliPlatform;
    readonly includeUnsupported?: boolean;
    readonly declarations?: ReadonlyArray<LocalToolkitDeclaration>;
  } = {}
): LocalToolResolution | null => {
  const currentPlatform = options.currentPlatform ?? detectCliPlatform();
  const target = normalizeSegment(slug);

  for (const toolkit of declarationsFor(options.declarations)) {
    for (const tool of toolkit.tools) {
      const finalSlug = normalizeLocalToolSlug(tool.slug, toolkit.slug);
      const matches =
        normalizeSegment(finalSlug) === target ||
        normalizeSegment(tool.slug) === target ||
        normalizeSegment(`${toolkit.slug}_${tool.slug}`) === target;
      if (!matches) continue;

      const supported =
        supportsCliPlatform(toolkit.platforms, currentPlatform) &&
        supportsCliPlatform(tool.platforms, currentPlatform);
      if (!supported && !options.includeUnsupported) return null;
      return { toolkit, tool, finalSlug, supported, currentPlatform };
    }
  }

  return null;
};

export const getLocalToolInputDefinition = (
  slug: string,
  options: { readonly declarations?: ReadonlyArray<LocalToolkitDeclaration> } = {}
): {
  readonly finalSlug: string;
  readonly toolkit: string;
  readonly schema: Record<string, unknown>;
  readonly version: 'local';
} | null => {
  const resolution = resolveLocalTool(slug, {
    includeUnsupported: true,
    declarations: options.declarations,
  });
  if (!resolution) return null;
  return {
    finalSlug: resolution.finalSlug,
    toolkit: resolution.toolkit.slug,
    schema: toCustomTool(resolution.toolkit, resolution.tool).inputSchema,
    version: 'local',
  };
};

export const executeLocalToolBySlug = async (
  slug: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | null> => {
  const resolution = resolveLocalTool(slug, { includeUnsupported: true });
  if (!resolution) return null;
  if (!resolution.supported) {
    throw new Error(
      `Local tool ${resolution.finalSlug} is not supported on ${resolution.currentPlatform}. Supported platforms: ${formatSupportedPlatforms(resolution.tool.platforms)}.`
    );
  }

  const parsed = resolution.tool.inputParams.safeParse(args);
  if (!parsed.success) {
    throw new Error(
      `Invalid arguments for local tool ${resolution.finalSlug}: ${parsed.error.issues
        .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`
    );
  }

  return executeLocalTool(resolution.tool.execution, parsed.data as Record<string, unknown>, {
    toolkit: resolution.toolkit,
    tool: resolution.tool,
    finalSlug: resolution.finalSlug,
    platform: resolution.currentPlatform,
  });
};
