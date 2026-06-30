import { describe, expect, it } from 'vitest';
import {
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
