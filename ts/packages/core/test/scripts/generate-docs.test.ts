import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAccessPaths,
  discoverModelFiles,
  escapeTableTextForMdx,
  escapeTextForMdx,
  escapeTypeForMdx,
  generateClassMdx,
  getSourceFileText,
  isParameterRequired,
  parseSourceSignatureTypesAtLine,
  parseTypeDocGraph,
  runTypeDocCommand,
  simplifyTypeForSignature,
  simplifyTypeForTable,
} from '../../scripts/generate-docs';

import { parsePage } from '../../../../../scripts/docs-reference-check/pages';
import { Composio } from '../../src/composio';
import { toolMocks } from '../utils/mocks/data.mock';

const KIND = { Module: 2, Class: 128, Property: 1024, Accessor: 262144 } as const;

const deprecatedComment = { blockTags: [{ tag: '@deprecated', content: [] }] };

function reference(target: number, extra: Record<string, unknown> = {}) {
  return { type: 'reference', target, name: 'Ref', ...extra };
}

function property(id: number, name: string, type: unknown, extra: Record<string, unknown> = {}) {
  return { id, name, kind: KIND.Property, flags: {}, type, ...extra };
}

function classNode(id: number, name: string, children: unknown[] = []) {
  return { id, name, kind: KIND.Class, flags: {}, children };
}

// Mirrors the shape TypeDoc emits for the SDK: classes nested in modules,
// generic references, a type-parameter reference, a reference to another
// package, a getter, and deprecated aliases.
function sdkTypeDocFixture() {
  return {
    id: 0,
    name: '@composio/core',
    kind: 1,
    children: [
      {
        id: 1,
        name: 'src/composio',
        kind: KIND.Module,
        children: [
          classNode(10, 'Composio', [
            property(101, 'customToolkits', reference(20)),
            property(102, 'experimental', reference(30)),
            property(103, 'files', reference(70)),
            property(104, 'mcp', reference(40), { comment: deprecatedComment }),
            property(105, 'provider', reference(11, { refersToTypeParameter: true })),
            property(106, 'client', {
              type: 'reference',
              target: { packageName: '@composio/client', qualifiedName: 'Composio' },
              name: 'Composio',
            }),
            property(
              107,
              'tools',
              reference(60, { typeArguments: [{ type: 'intrinsic', name: 'unknown' }] })
            ),
            property(108, 'webhooks', reference(50)),
          ]),
        ],
      },
      classNode(20, 'CustomToolkits'),
      {
        id: 2,
        name: 'src/models/Experimental',
        kind: KIND.Module,
        children: [
          classNode(30, 'Experimental', [
            property(301, 'customToolkits', reference(20), { comment: deprecatedComment }),
            property(302, 'usage', reference(80)),
          ]),
        ],
      },
      classNode(40, 'MCP'),
      {
        id: 3,
        name: 'Webhooks',
        kind: KIND.Module,
        children: [
          classNode(50, 'Webhooks', [
            {
              id: 501,
              name: 'endpoints',
              kind: KIND.Accessor,
              flags: {},
              getSignature: { type: reference(51) },
            },
            property(502, 'subscriptions', reference(52)),
          ]),
          classNode(51, 'WebhookEndpoints'),
          classNode(52, 'WebhookSubscriptions'),
        ],
      },
      classNode(60, 'Tools'),
      classNode(70, 'Files', [property(701, 'remote', reference(90))]),
      classNode(80, 'Usage'),
      classNode(90, 'RemoteFile'),
    ],
  };
}

function emptyClassDoc(name: string) {
  return { name, description: `${name} API`, constructor: undefined, methods: [], properties: [] };
}

function usageMdxFor(name: string): string {
  const paths = buildAccessPaths(parseTypeDocGraph(sdkTypeDocFixture()));
  return generateClassMdx(emptyClassDoc(name), paths.get(name));
}

function usageBlock(path: string, binding: string): string {
  return (
    '```typescript\n' +
    "import { Composio } from '@composio/core';\n" +
    '\n' +
    "const composio = new Composio({ apiKey: 'your-api-key' });\n" +
    `const ${binding} = ${path};\n` +
    '```'
  );
}

describe('generate-docs usage blocks', () => {
  it('renders nested webhook sub-clients through composio.webhooks', () => {
    expect(usageMdxFor('WebhookEndpoints')).toContain(
      usageBlock('composio.webhooks.endpoints', 'endpoints')
    );
    expect(usageMdxFor('WebhookSubscriptions')).toContain(
      usageBlock('composio.webhooks.subscriptions', 'subscriptions')
    );
  });

  it('renders Usage through composio.experimental', () => {
    expect(usageMdxFor('Usage')).toContain(usageBlock('composio.experimental.usage', 'usage'));
  });

  it('prefers the non-deprecated customToolkits path over the experimental alias', () => {
    const mdx = usageMdxFor('CustomToolkits');

    expect(mdx).toContain(usageBlock('composio.customToolkits', 'customToolkits'));
    expect(mdx).not.toContain('composio.experimental.customToolkits');
    expect(mdx).not.toContain('deprecated');
  });

  it('renders the deprecated-only MCP path with a deprecation note', () => {
    const mdx = usageMdxFor('MCP');

    expect(mdx).toContain(usageBlock('composio.mcp', 'mcp'));
    expect(mdx).toContain('The `composio.mcp` property is deprecated.');
  });

  it('renders generic references such as composio.tools', () => {
    expect(usageMdxFor('Tools')).toContain(usageBlock('composio.tools', 'tools'));
  });

  it('renders no Usage section for classes only reachable through internal classes', () => {
    expect(usageMdxFor('RemoteFile')).not.toContain('## Usage');
  });

  it('maps only classes reachable from Composio through public class references', () => {
    const paths = buildAccessPaths(parseTypeDocGraph(sdkTypeDocFixture()));

    expect(Object.fromEntries(paths)).toEqual({
      CustomToolkits: { path: ['customToolkits'], deprecated: false },
      Experimental: { path: ['experimental'], deprecated: false },
      MCP: { path: ['mcp'], deprecated: true },
      Tools: { path: ['tools'], deprecated: false },
      Usage: { path: ['experimental', 'usage'], deprecated: false },
      WebhookEndpoints: { path: ['webhooks', 'endpoints'], deprecated: false },
      WebhookSubscriptions: { path: ['webhooks', 'subscriptions'], deprecated: false },
      Webhooks: { path: ['webhooks'], deprecated: false },
    });
  });

  it('imports Composio and calls no method in every Usage block', () => {
    for (const name of ['CustomToolkits', 'MCP', 'Tools', 'Usage', 'WebhookEndpoints']) {
      const mdx = usageMdxFor(name);
      expect(mdx).toContain("import { Composio } from '@composio/core';");
      expect(mdx).not.toContain('.list()');
      expect(mdx).not.toMatch(/const \w+ = composio[\w.]*\(/);
    }
  });

  it('fails with a parse error naming a field the walk needs', () => {
    const fixture = sdkTypeDocFixture();
    // Drop `kind` from the Composio class node.
    const composioModule = fixture.children[0] as { children: Array<Record<string, unknown>> };
    delete composioModule.children[0].kind;

    expect(() => parseTypeDocGraph(fixture)).toThrow(/children\[0\]\.children\[0\]\.kind/);
  });
});

function methodDoc(name: string, examples: string[]) {
  return {
    name,
    description: '',
    signatures: [
      {
        parameters: [{ name: 'slug', type: 'string', required: true, description: '' }],
        returnType: 'Promise<string>',
      },
    ],
    examples,
    isAsync: true,
  };
}

function classMdxWithMethod(examples: string[]): string {
  return generateClassMdx({ ...emptyClassDoc('Tools'), methods: [methodDoc('execute', examples)] });
}

describe('generate-docs code fences', () => {
  it('marks method signature fences with the signature option', () => {
    expect(classMdxWithMethod([])).toContain(
      '```typescript signature\nasync execute(slug: string): Promise<string>\n```'
    );
  });

  it('marks constructor signature fences with the signature option', () => {
    const mdx = generateClassMdx({
      ...emptyClassDoc('Composio'),
      constructor: { ...methodDoc('constructor', []), isAsync: false },
    });

    expect(mdx).toContain('```typescript signature\nconstructor(slug: string)');
  });

  it('keeps an authored nocheck option on the fence line, not in the code', () => {
    const mdx = classMdxWithMethod([
      '```ts nocheck="Express handler"\napp.post(\'/webhook\', handler);\n```',
    ]);

    expect(mdx).toContain(
      '```typescript nocheck="Express handler"\napp.post(\'/webhook\', handler);\n```'
    );
  });

  it('emits an example with prose and two fences as written, without nesting', () => {
    const mdx = classMdxWithMethod([
      'Execute by slug:\n```ts\nawait first();\n```\nOr with a version:\n```typescript\nawait second();\n```',
    ]);

    expect(mdx).toContain(
      '**Example**\n\n' +
        'Execute by slug:\n```typescript\nawait first();\n```\n' +
        'Or with a version:\n```typescript\nawait second();\n```\n'
    );
    const exampleSection = mdx.slice(mdx.indexOf('**Example**'));
    expect(exampleSection.match(/^```/gm)).toHaveLength(4);
  });

  it('wraps a fence-less example once in a typescript fence', () => {
    const mdx = classMdxWithMethod(["await composio.tools.execute('GITHUB_GET_REPOS');"]);

    expect(mdx).toContain(
      "**Example**\n\n```typescript\nawait composio.tools.execute('GITHUB_GET_REPOS');\n```\n"
    );
  });

  it('fails generation when an authored fence claims the signature option', () => {
    expect(() =>
      classMdxWithMethod(['```typescript signature\nexecute(slug: string): void\n```'])
    ).toThrow(/Tools\.execute.*signature/);
  });
});

describe('generate-docs type rendering', () => {
  it('preserves inline object shapes in signatures', () => {
    const type =
      '{ cursor?: string; isComposioManaged?: boolean; limit?: number; toolkit?: string }';

    expect(simplifyTypeForSignature(type)).toBe(type);
  });

  it('preserves inline object shapes in parameter tables', () => {
    const type = '{ arguments?: Record<string, unknown>; sessionId: string }';

    expect(simplifyTypeForTable(type)).toBe(type);
  });

  it('preserves nested object shapes instead of collapsing them to object', () => {
    const type = '{ account?: { id?: string; label?: string }; timeout?: number }';

    expect(simplifyTypeForSignature(type)).toBe(type);
    expect(simplifyTypeForTable(type)).toBe(type);
  });

  it('escapes pipes and braces for MDX tables', () => {
    expect(escapeTypeForMdx("{ status: 'enable' | 'disable' }")).toBe(
      "\\{ status: 'enable' \\| 'disable' \\}"
    );
  });

  it('escapes existing backslashes before adding MDX table escapes', () => {
    expect(escapeTypeForMdx(String.raw`{ pattern: '\|' }`)).toBe(String.raw`\{ pattern: '\\\|' \}`);
  });

  it('escapes existing backslashes before MDX text and table metacharacters', () => {
    expect(escapeTextForMdx(String.raw`Use \{value\}, \|, or <literal>`)).toBe(
      String.raw`Use \\\{value\\\}, \\\|, or &lt;literal&gt;`
    );
  });

  it('keeps multiline descriptions in one table cell', () => {
    expect(escapeTableTextForMdx('First line\n  second line')).toBe('First line second line');
  });

  it('treats optional and default-valued parameters as optional', () => {
    expect(isParameterRequired({ flags: { isOptional: true } })).toBe(false);
    expect(isParameterRequired({ defaultValue: '{}' })).toBe(false);
    expect(isParameterRequired({})).toBe(true);
  });

  it('reads named parameter and return types from source signatures', () => {
    const source = `
class Example {
  async list(
    query?: AuthConfigListParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<AuthConfigListResponse> {
    return undefined as never;
  }
}
`;
    const line = source.split('\n').findIndex(line => line.includes('async list(')) + 1;

    const signature = parseSourceSignatureTypesAtLine(source, line);

    expect(signature?.parameters.get('query')).toBe('AuthConfigListParams');
    expect(signature?.parameters.get('requestOptions')).toBe('ComposioRequestOptions');
    expect(signature?.returnType).toBe('Promise<AuthConfigListResponse>');
  });

  it('reads authored inline object types from source signatures', () => {
    const source = `
class Example {
  getResult(input: { id: string; mode?: 'fast' | 'safe' }): { ok: boolean; value?: string } {
    return { ok: true };
  }
}
`;
    const line = source.split('\n').findIndex(line => line.includes('getResult(')) + 1;

    const signature = parseSourceSignatureTypesAtLine(source, line);

    expect(signature?.parameters.get('input')).toBe("{ id: string; mode?: 'fast' | 'safe' }");
    expect(signature?.returnType).toBe('{ ok: boolean; value?: string }');
  });

  it('does not infer a return type when the source signature omits one', () => {
    const source = `
class Example {
  async toolkits(options?: ToolRouterToolkitsOptions, requestOptions?: ComposioRequestOptions) {
    const params = { search: options?.search };
    return params;
  }

  async search(params: { query: string }): Promise<ToolRouterSessionSearchResponse> {
    return undefined as never;
  }
}
`;
    const line = source.split('\n').findIndex(line => line.includes('async toolkits(')) + 1;

    const signature = parseSourceSignatureTypesAtLine(source, line);

    expect(signature?.parameters.get('options')).toBe('ToolRouterToolkitsOptions');
    expect(signature?.parameters.get('requestOptions')).toBe('ComposioRequestOptions');
    expect(signature?.returnType).toBeUndefined();
  });

  it('keeps arrow function parameter types intact', () => {
    const source = `
class Example {
  subscribe(fn: (event: TriggerEvent) => void, filters?: TriggerSubscribeParams): void {
    fn(undefined as never);
  }
}
`;
    const line = source.split('\n').findIndex(line => line.includes('subscribe(')) + 1;

    const signature = parseSourceSignatureTypesAtLine(source, line);

    expect(signature?.parameters.get('fn')).toBe('(event: TriggerEvent) => void');
    expect(signature?.parameters.get('filters')).toBe('TriggerSubscribeParams');
    expect(signature?.returnType).toBe('void');
  });
});

describe('generate-docs type truncation', () => {
  const slugUnion = [
    'COMPOSIO_GET_TOOL_SCHEMAS',
    'COMPOSIO_SEARCH_TOOLS',
    'COMPOSIO_MULTI_EXECUTE_TOOL',
    'COMPOSIO_MANAGE_CONNECTIONS',
    'COMPOSIO_WAIT_FOR_CONNECTIONS',
  ]
    .map(slug => `'${slug}'`)
    .join(' | ');

  it('cuts a long union between members in signatures', () => {
    expect(simplifyTypeForSignature(slugUnion)).toBe(
      "'COMPOSIO_GET_TOOL_SCHEMAS' | 'COMPOSIO_SEARCH_TOOLS' | 'COMPOSIO_MULTI_EXECUTE_TOOL' | ..."
    );
  });

  it('cuts a long union between members in parameter tables', () => {
    expect(simplifyTypeForTable(slugUnion)).toBe(
      "'COMPOSIO_GET_TOOL_SCHEMAS' | 'COMPOSIO_SEARCH_TOOLS' | ..."
    );
  });

  it('does not split a union member that contains a pipe', () => {
    const type = `'${'a|'.repeat(30)}' | 'COMPOSIO_SEARCH_TOOLS' | ${slugUnion}`;

    expect(simplifyTypeForSignature(type)).toBe(
      `'${'a|'.repeat(30)}' | 'COMPOSIO_SEARCH_TOOLS' | ...`
    );
  });

  it('elides a union whose first member does not fit', () => {
    const type = `'${'a'.repeat(110)}' | 'COMPOSIO_SEARCH_TOOLS'`;

    expect(simplifyTypeForSignature(type)).toBe('...');
    expect(simplifyTypeForTable(type)).toBe('...');
  });
});

describe('generate-docs source lookup', () => {
  let packageDir: string;

  beforeEach(async () => {
    packageDir = await mkdtemp(join(tmpdir(), 'composio-generate-docs-'));
  });

  afterEach(async () => {
    await rm(packageDir, { recursive: true, force: true });
  });

  it('resolves TypeDoc source paths against the package directory', async () => {
    await mkdir(join(packageDir, 'src/models'), { recursive: true });
    await writeFile(join(packageDir, 'src/models/Example.ts'), 'export class Example {}\n');

    expect(getSourceFileText('src/models/Example.ts', packageDir)).toBe(
      'export class Example {}\n'
    );
  });

  it('throws when a TypeDoc source path does not resolve', () => {
    expect(() => getSourceFileText('ts/packages/core/src/models/Example.ts', packageDir)).toThrow(
      /ENOENT/
    );
  });
});

describe('generate-docs command construction', () => {
  let modelsDir: string;

  beforeEach(async () => {
    modelsDir = await mkdtemp(join(tmpdir(), 'composio-generate-docs-'));
  });

  afterEach(async () => {
    await rm(modelsDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('keeps only plainly named model files and drops shell metacharacter names', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const name of [
      'Files.ts',
      'tool_router.ts',
      'x;touch pwned.ts',
      '$(id).ts',
      'a b.ts',
      'Files.test.ts',
      'notes.md',
    ]) {
      await writeFile(join(modelsDir, name), '');
    }

    const discovered = await discoverModelFiles(modelsDir);

    expect(discovered.sort()).toEqual(['src/models/Files.ts', 'src/models/tool_router.ts']);
  });

  it('runs TypeDoc with Node and passes every entry point as its own argument', async () => {
    const typedocBin = join(modelsDir, 'typedoc');
    const outputJson = join(modelsDir, 'typedoc-args.txt');
    await writeFile(
      typedocBin,
      `const { writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const outputJson = args[args.indexOf('--json') + 1];
writeFileSync(outputJson, args.join('\\n'));
`
    );

    runTypeDocCommand(['src/composio.ts', 'src/models/a b.ts'], {
      outputJson,
      packageDir: modelsDir,
      typedocBin,
    });

    const args = (await readFile(outputJson, 'utf8')).split('\n');
    expect(args[0]).toBe('--json');
    expect(args).toContain('src/models/a b.ts');
    expect(args[args.indexOf('--displayBasePath') + 1]).toBe(modelsDir);
    expect(args.some(arg => arg.includes('npx'))).toBe(false);
    expect(args.slice(-2)).toEqual(['src/composio.ts', 'src/models/a b.ts']);
  });
});

describe('access path ranking', () => {
  const rank = (members: unknown[], children: unknown[] = []) =>
    buildAccessPaths(
      parseTypeDocGraph({
        id: 0,
        name: 'SDK',
        kind: 1,
        children: [
          classNode(1, 'Composio', members),
          classNode(2, 'Target', children),
          classNode(3, 'Other'),
        ],
      })
    );

  it('breaks equal length ties in declaration order even when TypeDoc sorts alphabetically', () => {
    const paths = rank([
      property(20, 'alphabeticallyFirst', reference(2), {
        sources: [{ fileName: 'src/composio.ts', line: 50, character: 2 }],
      }),
      property(21, 'declaredFirst', reference(2), {
        sources: [{ fileName: 'src/composio.ts', line: 10, character: 2 }],
      }),
    ]);
    expect(paths.get('Target')?.path).toEqual(['declaredFirst']);
  });

  it('picks a longer non-deprecated path over a shorter deprecated path and handles cycles', () => {
    const paths = rank(
      [
        property(20, 'old', reference(3), { comment: deprecatedComment }),
        property(21, 'target', reference(2)),
      ],
      [property(22, 'cycle', reference(1)), property(23, 'other', reference(3))]
    );
    expect(paths.get('Other')).toEqual({ path: ['target', 'other'], deprecated: false });
    expect(paths.has('Composio')).toBe(false);
  });

  it('uses the shortest public instance path when neither path is deprecated', () => {
    const paths = rank(
      [
        property(20, 'target', reference(2)),
        property(21, 'privateOther', reference(3), { flags: { isPrivate: true } }),
        property(22, 'protectedOther', reference(3), { flags: { isProtected: true } }),
        property(23, 'staticOther', reference(3), { flags: { isStatic: true } }),
        property(24, 'other', reference(3)),
      ],
      [property(25, 'nestedOther', reference(3))]
    );
    expect(paths.get('Other')?.path).toEqual(['other']);
  });

  it('renders a quoted property with bracket access and a valid local binding', () => {
    const access = rank([property(20, 'webhook-endpoints', reference(2))]).get('Target');
    expect(generateClassMdx(emptyClassDoc('Target'), access)).toContain(
      usageBlock('composio["webhook-endpoints"]', 'instance')
    );
  });
});

describe('authored reference fence validation', () => {
  it.each([
    ['unlabelled', '```\nconst x = 1;\n```', /language/],
    ['mixed-case', '```TypeScript\nconst x = 1;\n```', /language/],
    ['blockquote signature', '> ```typescript signature\n> const x = 1;\n> ```', /signature/],
    ['unclosed', '```typescript\nconst x = 1;', /unclosed/i],
    ['invalid metadata', '```ts nocheck=""\nconst x = 1;\n```', /non-empty reason/],
  ])('rejects an %s fence even after a valid fence', (_, invalid, message) => {
    expect(() =>
      classMdxWithMethod(['```typescript\nconst valid = true;\n```\n\n' + invalid])
    ).toThrow(message);
  });

  it('preserves a checked fence inside a blockquote', () => {
    const quoted = '> ```typescript\n> const valid = true;\n> ```';
    const page = classMdxWithMethod([quoted]);
    const fences = Effect.runSync(parsePage('tools.mdx', page));
    expect(fences.map(({ meta, code }) => ({ meta, code }))).toEqual([
      { meta: 'signature', code: 'async execute(slug: string): Promise<string>' },
      { meta: null, code: 'const valid = true;' },
    ]);
  });
});

it('executes the generated Quick Start with the real SDK and a stub client', async () => {
  const reference = await readFile(
    new URL(
      '../../../../../docs/content/reference/sdk-reference/typescript/index.mdx',
      import.meta.url
    ),
    'utf8'
  );
  const example = /## Quick Start\s+```typescript\n([\s\S]*?)\n```/.exec(reference)?.[1];
  expect(example).toContain("import { Composio } from '@composio/core';");
  const tool = {
    ...toolMocks.rawTool,
    slug: 'GITHUB_LIST_STARGAZERS',
    toolkit: { ...toolMocks.rawTool.toolkit, slug: 'github' },
  };
  const execute = vi.fn().mockResolvedValue(toolMocks.rawToolExecuteResponse);
  const list = vi.fn().mockResolvedValue({ items: [tool], total_pages: 1, current_page: 1 });
  const retrieve = vi.fn().mockResolvedValue(tool);
  class TestComposio extends Composio {
    constructor(config: ConstructorParameters<typeof Composio>[0]) {
      super(config);
      vi.spyOn(this.client.tools, 'list').mockImplementation(list);
      vi.spyOn(this.client.tools, 'retrieve').mockImplementation(retrieve);
      vi.spyOn(this.client.tools, 'execute').mockImplementation(execute);
    }
  }

  const code = example?.replace("import { Composio } from '@composio/core';", '');
  await runInNewContext(`(async () => {\n${code}\n})()`, {
    Composio: TestComposio,
    process: { env: { COMPOSIO_API_KEY: 'test-key' } },
  });
  expect(list).toHaveBeenCalledOnce();
  expect(retrieve).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0]?.slice(0, 2)).toEqual([
    'GITHUB_LIST_STARGAZERS',
    expect.objectContaining({
      arguments: { owner: 'ComposioHQ', repo: 'composio' },
      user_id: 'user-123',
      version: '20250909_00',
    }),
  ]);
});
