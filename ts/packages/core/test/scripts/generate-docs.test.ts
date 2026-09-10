import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTypeDocArgs,
  discoverModelFiles,
  escapeTextForMdx,
  escapeTypeForMdx,
  parseSourceSignatureTypesAtLine,
  simplifyTypeForSignature,
  simplifyTypeForTable,
} from '../../scripts/generate-docs';

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

  it('passes every entry point as its own argument instead of a joined command line', () => {
    const args = buildTypeDocArgs(['src/composio.ts', 'src/models/a b.ts'], '/tmp/out.json');

    expect(args[0]).toBe('typedoc');
    expect(args).toContain('src/models/a b.ts');
    expect(args.some(arg => arg.includes(' typedoc') || arg.includes('npx'))).toBe(false);
    expect(args.slice(-2)).toEqual(['src/composio.ts', 'src/models/a b.ts']);
  });
});
