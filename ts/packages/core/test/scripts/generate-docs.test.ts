import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discoverModelFiles,
  escapeTableTextForMdx,
  escapeTextForMdx,
  escapeTypeForMdx,
  extractClass,
  generateClassMdx,
  generateIndexMdx,
  getSourceFileText,
  isParameterRequired,
  parseSourceSignatureTypesAtLine,
  parseSourcePropertyTypeAtLine,
  runTypeDocCommand,
  simplifyTypeForSignature,
  simplifyTypeForTable,
} from '../../scripts/generate-docs';

describe('generate-docs usage examples', () => {
  it('uses the public get method in the Toolkits usage block', () => {
    const mdx = generateClassMdx({
      name: 'Toolkits',
      description: 'Toolkits API',
      constructor: undefined,
      methods: [],
      properties: [],
    });

    expect(mdx).toContain(
      '```typescript\n' +
        "const composio = new Composio({ apiKey: 'your-api-key' });\n" +
        'const result = await composio.toolkits.get({});\n' +
        '```'
    );
    expect(mdx).not.toContain('composio.toolkits.list()');
  });

  it.each(['Sessions', 'index'])(
    'executes the %s entry example through sessions.create',
    async name => {
      const mdx =
        name === 'index'
          ? generateIndexMdx([])
          : generateClassMdx({
              name,
              description: 'Sessions API',
              constructor: undefined,
              methods: [],
              properties: [],
            });
      const snippet = mdx.match(/```typescript\n([\s\S]*?)```/)?.[1];
      expect(snippet).toBeDefined();
      const tools = vi.fn(async () => []);
      const create = vi.fn(async (userId: string, _config?: unknown) => {
        expect(userId).toBe('user-123');
        return { tools };
      });
      class Composio {
        sessions = { create };
      }
      // Execute the generated example, not a hand-written copy. Unsupported
      // sessions.list() and legacy tools.get() calls fail against this surface.
      const run = new Function(
        'Composio',
        `return (async () => {
      ${snippet!.replace(/^import .*?;\n/gm, '')}
    })();`
      );
      await run(Composio);
      expect(create).toHaveBeenCalledOnce();
      if (name === 'index') expect(tools).toHaveBeenCalledOnce();
    }
  );
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

  it('recovers property types without including initializers or following members', () => {
    expect(
      parseSourcePropertyTypeAtLine(
        'public config: ToolRouterSessionConfig = metadata.config;\n',
        1
      )
    ).toBe('ToolRouterSessionConfig');
    expect(
      parseSourcePropertyTypeAtLine('public value: {\n  enabled: boolean;\n} | undefined;\n', 1)
    ).toBe('{\n  enabled: boolean;\n} | undefined');
    expect(
      parseSourcePropertyTypeAtLine(
        'public config = { user_id: "user" };\npublic next: string;\n',
        1
      )
    ).toBeUndefined();
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

  it('uses the authored property alias rather than TypeDoc client internals', async () => {
    const file = join(packageDir, 'Session.ts');
    await writeFile(file, 'public config: ToolRouterSessionConfig;\n');
    const doc = extractClass({
      id: 1,
      name: 'ToolRouterSession',
      kind: 128,
      children: [
        {
          id: 2,
          name: 'config',
          kind: 1024,
          type: { type: 'reference', name: 'Config' },
          sources: [{ fileName: file, line: 1 }],
        },
      ],
    });
    expect(doc.properties[0].type).toBe('ToolRouterSessionConfig');
    const mdx = generateClassMdx(doc);
    expect(mdx).toContain('| `config` | `ToolRouterSessionConfig` |');
    expect(mdx).toContain('](/docs/configuring-sessions)');
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
