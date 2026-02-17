import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Toolkit } from '@/types/toolkit';

const TOOLKITS_PATH = join(process.cwd(), 'public/data/toolkits.json');

let cached: { list: Toolkit[]; bySlug: Map<string, Toolkit> } | null = null;

function buildCache(toolkits: Toolkit[]) {
  cached = {
    list: toolkits,
    bySlug: new Map(toolkits.map(t => [t.slug, t])),
  };
  return cached;
}

function parse(data: string): Toolkit[] {
  const toolkits = JSON.parse(data) as Toolkit[];

  if (!Array.isArray(toolkits)) {
    throw new Error('toolkits.json must contain an array');
  }

  if (toolkits.length === 0) {
    console.warn('[Toolkits] Warning: toolkits.json is empty');
  }

  return toolkits;
}

export async function getAllToolkits(): Promise<Toolkit[]> {
  if (cached) return cached.list;
  const data = await readFile(TOOLKITS_PATH, 'utf-8');
  return buildCache(parse(data)).list;
}

export async function getToolkitBySlug(slug: string): Promise<Toolkit | null> {
  if (cached) return cached.bySlug.get(slug) ?? null;
  const data = await readFile(TOOLKITS_PATH, 'utf-8');
  return buildCache(parse(data)).bySlug.get(slug) ?? null;
}

export function getAllToolkitsSync(): Toolkit[] {
  if (cached) return cached.list;
  const data = readFileSync(TOOLKITS_PATH, 'utf-8');
  return buildCache(parse(data)).list;
}
