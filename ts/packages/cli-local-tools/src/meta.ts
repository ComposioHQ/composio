import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const LOCAL_TOOLS_META_VERSION = 1;

export interface LocalToolMetaEntry {
  readonly authenticated?: boolean;
  readonly auth?: {
    readonly type?: string;
    readonly account?: string;
    readonly env?: Record<string, string>;
    readonly data?: Record<string, unknown>;
  };
  readonly installation?: {
    /** Override the command/binary used by CLI-backed local tools. */
    readonly command?: string;
    readonly path?: string;
    readonly version?: string;
  };
  readonly disabled?: boolean;
  readonly notes?: string;
  readonly updatedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export type LocalToolkitMetaEntry = LocalToolMetaEntry;

export interface LocalToolsMetaFile {
  readonly version: number;
  readonly updatedAt?: string;
  readonly tools: Record<string, LocalToolMetaEntry>;
  readonly toolkits: Record<string, LocalToolkitMetaEntry>;
}

export interface LocalToolsMetaOptions {
  readonly homeDir?: string;
  readonly path?: string;
}

export const getLocalToolsMetaPath = (options: LocalToolsMetaOptions = {}): string =>
  options.path ??
  process.env.COMPOSIO_LOCAL_TOOLS_PATH ??
  path.join(options.homeDir ?? os.homedir(), 'composio', 'local_tools.json');

export const createEmptyLocalToolsMeta = (): LocalToolsMetaFile => ({
  version: LOCAL_TOOLS_META_VERSION,
  tools: {},
  toolkits: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseLocalToolsMeta = (raw: string): LocalToolsMetaFile => {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    return createEmptyLocalToolsMeta();
  }
  return {
    version: typeof parsed.version === 'number' ? parsed.version : LOCAL_TOOLS_META_VERSION,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    tools: isRecord(parsed.tools) ? (parsed.tools as Record<string, LocalToolMetaEntry>) : {},
    toolkits: isRecord(parsed.toolkits)
      ? (parsed.toolkits as Record<string, LocalToolkitMetaEntry>)
      : {},
  };
};

export const readLocalToolsMeta = async (
  options: LocalToolsMetaOptions = {}
): Promise<LocalToolsMetaFile> => {
  const filePath = getLocalToolsMetaPath(options);
  try {
    return parseLocalToolsMeta(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyLocalToolsMeta();
    }
    throw error;
  }
};

export const writeLocalToolsMeta = async (
  meta: LocalToolsMetaFile,
  options: LocalToolsMetaOptions = {}
): Promise<void> => {
  const filePath = getLocalToolsMetaPath(options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const next: LocalToolsMetaFile = {
    ...meta,
    version: LOCAL_TOOLS_META_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
};

export const getLocalToolMeta = async (
  finalSlug: string,
  options: LocalToolsMetaOptions = {}
): Promise<LocalToolMetaEntry | undefined> => {
  const meta = await readLocalToolsMeta(options);
  return meta.tools[finalSlug.toUpperCase()] ?? meta.tools[finalSlug];
};

export const getLocalToolkitMeta = async (
  toolkitSlug: string,
  options: LocalToolsMetaOptions = {}
): Promise<LocalToolkitMetaEntry | undefined> => {
  const meta = await readLocalToolsMeta(options);
  return meta.toolkits[toolkitSlug.toLowerCase()] ?? meta.toolkits[toolkitSlug];
};

export const updateLocalToolMeta = async (
  finalSlug: string,
  patch: LocalToolMetaEntry,
  options: LocalToolsMetaOptions = {}
): Promise<LocalToolsMetaFile> => {
  const meta = await readLocalToolsMeta(options);
  const key = finalSlug.toUpperCase();
  const previous = meta.tools[key] ?? {};
  const next: LocalToolsMetaFile = {
    ...meta,
    tools: {
      ...meta.tools,
      [key]: {
        ...previous,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  await writeLocalToolsMeta(next, options);
  return next;
};

export const updateLocalToolkitMeta = async (
  toolkitSlug: string,
  patch: LocalToolkitMetaEntry,
  options: LocalToolsMetaOptions = {}
): Promise<LocalToolsMetaFile> => {
  const meta = await readLocalToolsMeta(options);
  const key = toolkitSlug.toLowerCase();
  const previous = meta.toolkits[key] ?? {};
  const next: LocalToolsMetaFile = {
    ...meta,
    toolkits: {
      ...meta.toolkits,
      [key]: {
        ...previous,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  await writeLocalToolsMeta(next, options);
  return next;
};
