import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { getMetaToolOverride } from './meta-tool-overrides';

const jsonTypeSchema = z.enum([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
]);

// Normalize the schema fields used by the reference renderers. The generated
// snapshot remains unchanged; `any` is a display label for an unrestricted type.
const parameterSchema = z.object({
  type: z
    .union([jsonTypeSchema, z.array(jsonTypeSchema).min(1)])
    .optional()
    .transform(type => {
      if (type === undefined) return 'any';
      return Array.isArray(type) ? type.join(' | ') : type;
    }),
  description: z
    .string()
    .default('')
    .transform(description =>
      description.replace(/\*\*/g, '').replace(/__/g, '').replace(/\n+/g, ' ').trim()
    ),
  required: z.array(z.string()).default([]),
  default: z.unknown().optional(),
  enum: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default([])
    .transform(values => values.map(value => String(value))),
  get properties(): z.ZodDefault<z.ZodRecord<z.ZodString, typeof parameterSchema>> {
    return z.record(z.string(), parameterSchema).default({});
  },
  get items(): z.ZodOptional<typeof parameterSchema> {
    return parameterSchema.optional();
  },
});

type ParsedParameter = z.infer<typeof parameterSchema>;

export type MetaToolParameter = Omit<
  ParsedParameter,
  'type' | 'default' | 'properties' | 'items'
> & {
  typeLabel: string;
  defaultLabel: string | null;
  properties: Record<string, MetaToolParameter>;
  items?: MetaToolParameter;
};

/** Project schema nodes into one display model before they reach either renderer. */
function toDisplayParameter({
  type,
  default: defaultValue,
  properties,
  items,
  ...parameter
}: ParsedParameter): MetaToolParameter {
  const displayItems = items ? toDisplayParameter(items) : undefined;
  const typeLabel =
    type === 'array' ? `array<${displayItems ? displayItems.typeLabel : 'any'}>` : type;
  const defaultLabel =
    defaultValue === undefined || defaultValue === null || defaultValue === ''
      ? null
      : String(defaultValue);
  return {
    ...parameter,
    typeLabel,
    defaultLabel,
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, value]) => [name, toDisplayParameter(value)])
    ),
    items: displayItems,
  };
}

export type MetaToolSchema = MetaToolParameter;

export const metaToolSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    displayName: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    inputParameters: parameterSchema.transform(toDisplayParameter),
    responseSchema: parameterSchema.transform(toDisplayParameter),
  })
  .transform(tool => {
    const override = getMetaToolOverride(tool.slug);
    return {
      ...tool,
      summary: override ? override.summary : tool.description,
      whenToUse: override ? override.whenToUse : '',
      usageNote: override?.usageNote ?? '',
    };
  });

export type MetaTool = z.infer<typeof metaToolSchema>;

const metaToolsSchema = z.array(metaToolSchema);
const META_TOOLS_PATH = join(process.cwd(), 'public/data/meta-tools.json');

let cached: { list: MetaTool[]; bySlug: Map<string, MetaTool> } | null = null;

async function getCache() {
  if (cached) return cached;
  const data = await readFile(META_TOOLS_PATH, 'utf-8');
  const list = metaToolsSchema.parse(JSON.parse(data));
  cached = { list, bySlug: new Map(list.map(tool => [tool.slug, tool])) };
  return cached;
}

export async function getAllMetaTools(): Promise<MetaTool[]> {
  return (await getCache()).list;
}

export async function getMetaToolBySlug(slug: string): Promise<MetaTool | null> {
  return (await getCache()).bySlug.get(slug) ?? null;
}
