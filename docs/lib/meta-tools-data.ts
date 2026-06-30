import { readFile } from 'fs/promises';
import { join } from 'path';
import { getMetaToolOverride } from './meta-tool-overrides';

export interface MetaToolParameter {
  type: string;
  description: string;
  required?: string[] | boolean;
  default?: unknown;
  enum?: string[];
  examples?: unknown[];
  items?: Record<string, unknown>;
  properties?: Record<string, MetaToolParameter>;
}

export interface MetaToolSchema {
  type: string;
  properties: Record<string, MetaToolParameter>;
  required?: string[];
}

export interface MetaTool {
  slug: string;
  name: string;
  displayName: string;
  description: string;
  tags: string[];
  inputParameters: MetaToolSchema;
  responseSchema: MetaToolSchema;
  /** Hand-written Modal-voice copy, merged over the API data at read time. */
  summary?: string;
  whenToUse?: string;
  usageNote?: string;
}

const META_TOOLS_PATH = join(process.cwd(), 'public/data/meta-tools.json');

let cached: { list: MetaTool[]; bySlug: Map<string, MetaTool> } | null = null;

function buildCache(tools: MetaTool[]) {
  cached = {
    list: tools,
    bySlug: new Map(tools.map(t => [t.slug, t])),
  };
  return cached;
}

/** Merge the hand-written override copy over the API-sourced tool. */
function applyOverride(tool: MetaTool): MetaTool {
  const override = getMetaToolOverride(tool.slug);
  if (!override) return tool;
  return { ...tool, ...override };
}

function parse(data: string): MetaTool[] {
  const tools = JSON.parse(data) as MetaTool[];

  if (!Array.isArray(tools)) {
    throw new Error('meta-tools.json must contain an array');
  }

  return tools.map(applyOverride);
}

export async function getAllMetaTools(): Promise<MetaTool[]> {
  if (cached) return cached.list;
  const data = await readFile(META_TOOLS_PATH, 'utf-8');
  return buildCache(parse(data)).list;
}

export async function getMetaToolBySlug(slug: string): Promise<MetaTool | null> {
  if (cached) return cached.bySlug.get(slug) ?? null;
  const data = await readFile(META_TOOLS_PATH, 'utf-8');
  return buildCache(parse(data)).bySlug.get(slug) ?? null;
}