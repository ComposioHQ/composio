import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import z from 'zod/v3';
import {
  generateSessionOptionPages,
  linkSessionOptionOccurrences,
  renderReturnedConfig,
  renderSessionSchema,
} from '../../scripts/session-options';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true }))
  );
});

describe('Session option shape references', () => {
  it('routes every contract type link to an emitted page and section', () => {
    const pages = generateSessionOptionPages(fileURLToPath(new URL('../../', import.meta.url)));
    const anchors: Record<string, Set<string>> = {};
    for (const [slug, content] of Object.entries(pages)) {
      anchors[slug] = new Set([
        ...[...content.matchAll(/<a id="([^"]+)"/g)].map(match => match[1]),
        ...[...content.matchAll(/^## (.+)$/gm)].map(match =>
          match[1].toLowerCase().replace(/ /g, '-')
        ),
      ]);
    }
    for (const content of Object.values(pages)) {
      for (const match of content.matchAll(
        /\]\((session-(?:create-options|update-options|config))#([^)]*)\)/g
      )) {
        expect(anchors[match[1]]?.has(match[2]), `${match[1]}#${match[2]}`).toBe(true);
      }
    }
  }, 20000);

  it('links type occurrences without nesting links or changing code fences', () => {
    const signature = 'const config: ToolRouterSessionConfig = session.config;';
    const source = `\`ToolRouterSessionConfig\`\n\`\`\`typescript\n${signature}\n\`\`\``;
    const linked = linkSessionOptionOccurrences(source);
    expect(linked).toContain('[`ToolRouterSessionConfig`](session-config#returned-config)');
    expect(linked).toContain(`\`\`\`typescript\n${signature}\n\`\`\``);
    expect(linkSessionOptionOccurrences(linked)).toBe(linked);
  });
  it('distinguishes defaulted inferred output from parser input optionality', () => {
    const { sections } = renderSessionSchema(
      z.object({
        enable: z.boolean().default(true),
        optional: z.boolean().default(true).optional(),
        filled: z.string().optional().default('value'),
      }),
      'defaults'
    );
    const rows = sections[0].body;
    expect(rows.find(row => row.startsWith('| `enable` |'))).toContain('| `boolean` | Yes |');
    expect(rows.find(row => row.startsWith('| `optional` |'))).toContain(
      '| `boolean` \\| `undefined` | No |'
    );
    expect(rows.find(row => row.startsWith('| `filled` |'))).toContain('| `string` | Yes |');
  });

  it('keeps object alternatives and their nested map values navigable', () => {
    const schema = z.object({
      policies: z
        .record(
          z.union([
            z.object({ enable: z.array(z.string()) }),
            z.object({ tags: z.object({ disable: z.array(z.string()).optional() }) }),
          ])
        )
        .nullable()
        .optional(),
    });
    const { sections } = renderSessionSchema(schema, 'fixture');
    const root = sections[0].body.join('\n');
    expect(root).toContain('Record&lt;');
    expect(root).toContain('`null`');
    expect(root).toContain('`undefined`');
    expect(sections.some(section => section.body.some(row => row.startsWith('| `enable` |')))).toBe(
      true
    );
    expect(
      sections.some(section => section.body.some(row => row.startsWith('| `disable` |')))
    ).toBe(true);
    const ids = new Set(sections.map(section => section.id));
    const references = [
      ...sections
        .flatMap(section => section.body)
        .join('\n')
        .matchAll(/session-create-options#([^)]*)/g),
    ];
    expect(references.every(match => ids.has(match[1]))).toBe(true);
  });

  it('resolves a client alias into linked nested unions, records, and arrays', async () => {
    const packageDir = await mkdtemp(join(tmpdir(), 'session-options-'));
    temporaryDirectories.push(packageDir);
    await mkdir(join(packageDir, 'src/types'), { recursive: true });
    await writeFile(
      join(packageDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022' } })
    );
    await writeFile(
      join(packageDir, 'src/types/toolRouter.types.ts'),
      `
      interface Enabled { enabled: string[] }
      interface Disabled { disabled: string[] }
      interface ClientConfig { toolkits?: Enabled | Disabled; accounts: Record<string, { ids: string[] }> }
      export type ToolRouterSessionConfig = ClientConfig;
    `
    );
    const sections = renderReturnedConfig(packageDir);
    const body = sections.flatMap(section => section.body).join('\n');
    for (const field of ['toolkits', 'accounts', 'enabled', 'disabled', 'ids']) {
      expect(body).toContain(`| \`${field}\` |`);
    }
    const ids = new Set(sections.map(section => section.id));
    const references = [...body.matchAll(/session-config#([^)]*)/g)];
    expect(references).toHaveLength(3);
    expect(references.every(match => ids.has(match[1]))).toBe(true);
    expect(body).toContain('Array&lt;`string`&gt;');
  });
});
