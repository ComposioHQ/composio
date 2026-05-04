import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v3';
import {
  createCustomTool,
  createCustomToolkit,
  buildCustomToolsMap,
  serializeCustomTools,
  serializeCustomToolkits,
  LOCAL_TOOL_PREFIX,
} from '../../src/models/CustomTool';
import { SessionContextImpl } from '../../src/models/SessionContext';
import type { CustomTool, CustomToolkit, SessionContext } from '../../src/types/customTool.types';

// ────────────────────────────────────────────────────────────────
// createCustomTool() factory
// ────────────────────────────────────────────────────────────────

describe('createCustomTool', () => {
  const baseOptions = {
    name: 'Get user context',
    description: 'Retrieve what we know about a user',
    inputParams: z.object({
      category: z.string().describe('The category'),
    }),
    execute: vi.fn().mockResolvedValue({ result: 'ok' }),
  };

  it('should return a valid tool with correct fields', () => {
    const tool = createCustomTool('GET_USER_CONTEXT', baseOptions);

    expect(tool.slug).toBe('GET_USER_CONTEXT');
    expect(tool.name).toBe('Get user context');
    expect(tool.description).toBe('Retrieve what we know about a user');
    expect(tool.extendsToolkit).toBeUndefined();
    expect(tool.execute).toBe(baseOptions.execute);
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        category: { type: 'string', description: 'The category' },
      },
      required: ['category'],
    });
    expect(tool.inputParams).toBe(baseOptions.inputParams);
  });

  it('should include extendsToolkit when provided', () => {
    const tool = createCustomTool('GET_AD_ACCOUNTS', {
      ...baseOptions,
      extendsToolkit: 'meta_ads',
    });
    expect(tool.extendsToolkit).toBe('meta_ads');
  });

  it('should convert outputParams to JSON Schema when provided', () => {
    const tool = createCustomTool('WITH_OUTPUT', {
      ...baseOptions,
      outputParams: z.object({
        result: z.string(),
        count: z.number(),
      }),
    });

    expect(tool.outputSchema).toMatchObject({
      type: 'object',
      properties: {
        result: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['result', 'count'],
    });
  });

  it('should not have outputSchema when outputParams is not provided', () => {
    const tool = createCustomTool('NO_OUTPUT', baseOptions);
    expect(tool.outputSchema).toBeUndefined();
  });

  it('should convert Zod schema with optional fields correctly', () => {
    const tool = createCustomTool('OPT_FIELDS', {
      ...baseOptions,
      inputParams: z.object({
        required_field: z.string(),
        optional_field: z.number().optional(),
      }),
    });

    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        required_field: { type: 'string' },
        optional_field: { type: 'number' },
      },
      required: ['required_field'],
    });
  });

  it('should convert Zod schema with defaults correctly', () => {
    const tool = createCustomTool('DEFAULTS', {
      ...baseOptions,
      inputParams: z.object({
        category: z.string().default('all'),
      }),
    });

    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        category: expect.objectContaining({ type: 'string' }),
      },
    });
  });

  describe('slug validation', () => {
    it('should throw if slug is empty', () => {
      expect(() => createCustomTool('', baseOptions)).toThrow('slug is required');
    });

    it('should throw if slug starts with LOCAL_ prefix', () => {
      expect(() => createCustomTool('LOCAL_MY_TOOL', baseOptions)).toThrow(/LOCAL_/);
    });

    it('should throw if slug starts with local_ prefix (case-insensitive)', () => {
      expect(() => createCustomTool('local_something', baseOptions)).toThrow(/LOCAL_/);
    });

    it('should throw if slug contains invalid characters', () => {
      expect(() => createCustomTool('MY TOOL', baseOptions)).toThrow(/alphanumeric/);
      expect(() => createCustomTool('MY.TOOL', baseOptions)).toThrow(/alphanumeric/);
      expect(() => createCustomTool('MY@TOOL', baseOptions)).toThrow(/alphanumeric/);
    });

    it('should allow underscores and hyphens in slug', () => {
      const tool1 = createCustomTool('MY_TOOL', baseOptions);
      expect(tool1.slug).toBe('MY_TOOL');

      const tool2 = createCustomTool('my-tool', baseOptions);
      expect(tool2.slug).toBe('my-tool');
    });
  });

  describe('other validation', () => {
    it('should throw if name is missing', () => {
      expect(() => createCustomTool('SLUG', { ...baseOptions, name: '' })).toThrow(
        'name is required'
      );
    });

    it('should throw if description is missing', () => {
      expect(() => createCustomTool('SLUG', { ...baseOptions, description: '' })).toThrow(
        'description is required'
      );
    });

    it('should throw if inputParams is missing', () => {
      expect(() => createCustomTool('SLUG', { ...baseOptions, inputParams: null as any })).toThrow(
        'inputParams is required'
      );
    });

    it('should throw if execute is not a function', () => {
      expect(() => createCustomTool('SLUG', { ...baseOptions, execute: 'not-fn' as any })).toThrow(
        'execute must be a function'
      );
    });
  });

  describe('execute function signatures', () => {
    it('should allow no-session execute (input only)', async () => {
      const noSessionExecute = vi.fn().mockResolvedValue({ result: 42 });

      const tool = createCustomTool('NO_SESSION', {
        ...baseOptions,
        execute: noSessionExecute,
      });

      const result = await tool.execute({ category: 'test' } as any);
      expect(result.result).toBe(42);
      expect(noSessionExecute).toHaveBeenCalledWith({ category: 'test' });
    });

    it('should allow session-based execute (input + session)', async () => {
      const sessionExecute = vi.fn().mockResolvedValue({ userId: 'u1' });

      const tool = createCustomTool('WITH_SESSION', {
        ...baseOptions,
        execute: sessionExecute,
      });

      const mockSession: SessionContext = {
        userId: 'user_1',
        execute: vi.fn(),
        proxyExecute: vi.fn(),
      };

      const result = await tool.execute({ category: 'test' }, mockSession);
      expect(result.userId).toBe('u1');
      expect(sessionExecute).toHaveBeenCalledWith({ category: 'test' }, mockSession);
    });
  });
});

// ────────────────────────────────────────────────────────────────
// createCustomToolkit() factory
// ────────────────────────────────────────────────────────────────

describe('createCustomToolkit', () => {
  const baseTool = createCustomTool('GREP', {
    name: 'Grep',
    description: 'Search files',
    inputParams: z.object({ pattern: z.string() }),
    execute: vi.fn().mockResolvedValue({}),
  });

  it('should return a valid toolkit with correct fields', () => {
    const tk = createCustomToolkit('DEV_TOOLS', {
      name: 'Dev Tools',
      description: 'Local dev utilities',
      tools: [baseTool],
    });

    expect(tk.slug).toBe('DEV_TOOLS');
    expect(tk.name).toBe('Dev Tools');
    expect(tk.description).toBe('Local dev utilities');
    expect(tk.tools).toHaveLength(1);
    expect(tk.tools[0].slug).toBe('GREP');
  });

  it('should throw if slug is empty', () => {
    expect(() =>
      createCustomToolkit('', { name: 'X', description: 'X', tools: [baseTool] })
    ).toThrow('slug is required');
  });

  it('should throw if slug starts with LOCAL_', () => {
    expect(() =>
      createCustomToolkit('LOCAL_TK', { name: 'X', description: 'X', tools: [baseTool] })
    ).toThrow(/LOCAL_/);
  });

  it('should throw if slug contains invalid characters', () => {
    expect(() =>
      createCustomToolkit('MY TOOLKIT', { name: 'X', description: 'X', tools: [baseTool] })
    ).toThrow(/alphanumeric/);
  });

  it('should throw if name is missing', () => {
    expect(() =>
      createCustomToolkit('TK', { name: '', description: 'X', tools: [baseTool] })
    ).toThrow('name is required');
  });

  it('should throw if description is missing', () => {
    expect(() =>
      createCustomToolkit('TK', { name: 'X', description: '', tools: [baseTool] })
    ).toThrow('description is required');
  });

  it('should throw if tools array is empty', () => {
    expect(() => createCustomToolkit('TK', { name: 'X', description: 'X', tools: [] })).toThrow(
      'at least one tool is required'
    );
  });

  it('should reject tools with extendsToolkit set', () => {
    const extendsTool = createCustomTool('EXTENDS_TOOL', {
      name: 'Extends',
      description: 'Has extendsToolkit',
      extendsToolkit: 'gmail',
      inputParams: z.object({}),
      execute: vi.fn().mockResolvedValue({}),
    });

    expect(() =>
      createCustomToolkit('TK', { name: 'X', description: 'X', tools: [extendsTool] })
    ).toThrow('extendsToolkit');
  });
});

// ────────────────────────────────────────────────────────────────
// buildCustomToolsMap()
// ────────────────────────────────────────────────────────────────

describe('buildCustomToolsMap', () => {
  const makeTool = (slug: string, extendsToolkit?: string): CustomTool => ({
    slug,
    name: `Tool ${slug}`,
    description: `Description for ${slug}`,
    extendsToolkit,
    inputSchema: { type: 'object', properties: {} },
    inputParams: z.object({}),
    execute: vi.fn(),
  });

  describe('standalone tools (no extendsToolkit)', () => {
    it('should prefix as LOCAL_<SLUG>', () => {
      const map = buildCustomToolsMap([makeTool('MY_TOOL')]);

      expect(map.byFinalSlug.has('LOCAL_MY_TOOL')).toBe(true);
      expect(map.byOriginalSlug.has('MY_TOOL')).toBe(true);
    });

    it('should handle case-insensitive slugs (uppercased internally)', () => {
      const map = buildCustomToolsMap([makeTool('my_tool')]);

      expect(map.byOriginalSlug.has('MY_TOOL')).toBe(true);
      expect(map.byFinalSlug.has('LOCAL_MY_TOOL')).toBe(true);
    });
  });

  describe('tools with extendsToolkit', () => {
    it('should prefix as LOCAL_<EXTENDS_TOOLKIT>_<SLUG>', () => {
      const map = buildCustomToolsMap([makeTool('GET_EMAILS', 'gmail')]);

      expect(map.byFinalSlug.has('LOCAL_GMAIL_GET_EMAILS')).toBe(true);
      expect(map.byOriginalSlug.has('GET_EMAILS')).toBe(true);
    });
  });

  describe('toolkit tools', () => {
    it('should prefix as LOCAL_<TOOLKIT_SLUG>_<TOOL_SLUG>', () => {
      const sed = makeTool('SED');
      const tk: CustomToolkit = {
        slug: 'DEV_TOOLS',
        name: 'Dev Tools',
        description: 'Utilities',
        tools: [sed],
      };

      const map = buildCustomToolsMap([], [tk]);

      expect(map.byFinalSlug.has('LOCAL_DEV_TOOLS_SED')).toBe(true);
      expect(map.byOriginalSlug.has('SED')).toBe(true);
    });
  });

  describe('mixed tools and toolkits', () => {
    it('should handle standalone + toolkit tools together', () => {
      const grep = makeTool('GREP');
      const sed = makeTool('SED');
      const tk: CustomToolkit = {
        slug: 'DEV_TOOLS',
        name: 'Dev Tools',
        description: 'Utilities',
        tools: [sed],
      };

      const map = buildCustomToolsMap([grep], [tk]);

      expect(map.byFinalSlug.size).toBe(2);
      expect(map.byFinalSlug.has('LOCAL_GREP')).toBe(true);
      expect(map.byFinalSlug.has('LOCAL_DEV_TOOLS_SED')).toBe(true);
    });
  });

  describe('collision detection', () => {
    it('should throw on duplicate standalone slugs', () => {
      expect(() => buildCustomToolsMap([makeTool('DUPE'), makeTool('DUPE')])).toThrow('collision');
    });

    it('should throw on cross-group collision (standalone vs toolkit same original slug)', () => {
      const standalone = makeTool('SED');
      const tkTool = makeTool('SED');
      const tk: CustomToolkit = {
        slug: 'DEV_TOOLS',
        name: 'Dev Tools',
        description: 'Utilities',
        tools: [tkTool],
      };

      expect(() => buildCustomToolsMap([standalone], [tk])).toThrow('collision');
    });
  });

  describe('length validation', () => {
    it('should throw early in createCustomTool when slug is too long (standalone)', () => {
      const longSlug = 'A'.repeat(56); // LOCAL_ + 56 = 62 > 60
      expect(() =>
        createCustomTool(longSlug, {
          name: 'Long',
          description: 'Too long',
          inputParams: z.object({}),
          execute: vi.fn().mockResolvedValue({}),
        })
      ).toThrow('too long');
    });

    it('should throw early in createCustomTool when slug is too long (extension)', () => {
      // LOCAL_GMAIL_ = 12 chars, so slug > 48 chars overflows
      const longSlug = 'A'.repeat(49);
      expect(() =>
        createCustomTool(longSlug, {
          name: 'Long',
          description: 'Too long',
          extendsToolkit: 'gmail',
          inputParams: z.object({}),
          execute: vi.fn().mockResolvedValue({}),
        })
      ).toThrow('too long');
    });

    it('should throw early in createCustomToolkit when tool slug is too long', () => {
      const longSlug = 'A'.repeat(50); // LOCAL_DEV_TOOLS_ + 50 = 66 > 60
      const tool = makeTool(longSlug);
      expect(() =>
        createCustomToolkit('DEV_TOOLS', {
          name: 'Dev Tools',
          description: 'Utilities',
          tools: [tool],
        })
      ).toThrow('too long');
    });

    it('should still validate in buildCustomToolsMap as safety net', () => {
      const longSlug = 'A'.repeat(56);
      expect(() => buildCustomToolsMap([makeTool(longSlug)])).toThrow('exceeds');
    });

    it('should accept slugs that fit within 60 chars', () => {
      const slug = 'A'.repeat(54); // LOCAL_ + 54 = 60 exactly
      const map = buildCustomToolsMap([makeTool(slug)]);
      expect(map.byFinalSlug.size).toBe(1);
    });
  });
});

// ────────────────────────────────────────────────────────────────
// serializeCustomTools()
// ────────────────────────────────────────────────────────────────

describe('serializeCustomTools', () => {
  it('should serialize tools with extendsToolkit as extends_toolkit', () => {
    const tool: CustomTool = {
      slug: 'GET_DATA',
      name: 'Get Data',
      description: 'Gets some data',
      extendsToolkit: 'my_toolkit',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
      inputParams: z.object({ id: z.string() }),
      execute: vi.fn(),
    };

    const result = serializeCustomTools([tool]);

    expect(result).toEqual([
      {
        slug: 'GET_DATA',
        name: 'Get Data',
        description: 'Gets some data',
        extends_toolkit: 'my_toolkit',
        input_schema: { type: 'object', properties: { id: { type: 'string' } } },
      },
    ]);
  });

  it('should omit extends_toolkit when extendsToolkit is not provided', () => {
    const tool: CustomTool = {
      slug: 'NO_TOOLKIT',
      name: 'No Toolkit',
      description: 'No toolkit tool',
      inputSchema: { type: 'object', properties: {} },
      inputParams: z.object({}),
      execute: vi.fn(),
    };

    const result = serializeCustomTools([tool]);
    expect(result[0]).not.toHaveProperty('extends_toolkit');
  });

  it('should include output_schema when outputSchema is present', () => {
    const tool: CustomTool = {
      slug: 'WITH_OUTPUT',
      name: 'With Output',
      description: 'Has output schema',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      inputParams: z.object({}),
      execute: vi.fn(),
    };

    const result = serializeCustomTools([tool]);
    expect(result[0].output_schema).toEqual({
      type: 'object',
      properties: { result: { type: 'string' } },
    });
  });
});

// ────────────────────────────────────────────────────────────────
// serializeCustomToolkits()
// ────────────────────────────────────────────────────────────────

describe('serializeCustomToolkits', () => {
  it('should serialize toolkits with their tools', () => {
    const tool: CustomTool = {
      slug: 'SED',
      name: 'Sed Replace',
      description: 'Find and replace',
      inputSchema: { type: 'object', properties: { pattern: { type: 'string' } } },
      inputParams: z.object({ pattern: z.string() }),
      execute: vi.fn(),
    };
    const tk: CustomToolkit = {
      slug: 'DEV_TOOLS',
      name: 'Dev Tools',
      description: 'Dev utilities',
      tools: [tool],
    };

    const result = serializeCustomToolkits([tk]);

    expect(result).toEqual([
      {
        slug: 'DEV_TOOLS',
        name: 'Dev Tools',
        description: 'Dev utilities',
        tools: [
          {
            slug: 'SED',
            name: 'Sed Replace',
            description: 'Find and replace',
            input_schema: { type: 'object', properties: { pattern: { type: 'string' } } },
          },
        ],
      },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────
// SessionContextImpl
// ────────────────────────────────────────────────────────────────

describe('SessionContextImpl', () => {
  const mockClient = {
    toolRouter: {
      session: {
        execute: vi.fn(),
        proxyExecute: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose userId', () => {
    const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1');
    expect(ctx.userId).toBe('user_1');
  });

  it('should delegate execute() to client.toolRouter.session.execute()', async () => {
    mockClient.toolRouter.session.execute.mockResolvedValue({
      data: { result: 'ok' },
      error: null,
      log_id: 'log_1',
    });

    const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1');
    const result = await ctx.execute('GMAIL_SEND_EMAIL', { to: 'test@test.com' });

    expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith('sess_1', {
      tool_slug: 'GMAIL_SEND_EMAIL',
      arguments: { to: 'test@test.com' },
    });
    expect(result).toEqual({
      data: { result: 'ok' },
      error: null,
      logId: 'log_1',
    });
  });

  it('should preserve logId and error when execute() returns an error', async () => {
    mockClient.toolRouter.session.execute.mockResolvedValue({
      data: {},
      error: 'something went wrong',
      log_id: 'log_2',
    });

    const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1');
    const result = await ctx.execute('BAD_TOOL', {});

    expect(result.logId).toBe('log_2');
    expect(result.error).toBe('something went wrong');
  });

  it('should call client.toolRouter.session.proxyExecute() via proxyExecute()', async () => {
    mockClient.toolRouter.session.proxyExecute.mockResolvedValue({
      status: 200,
      data: { proxy_result: true },
    });
    const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1');

    const result = await ctx.proxyExecute({
      toolkit: 'github',
      endpoint: 'https://api.github.com/user',
      method: 'GET',
      parameters: [{ in: 'header' as const, name: 'X-Custom', value: 'val' }],
    });

    expect(mockClient.toolRouter.session.proxyExecute).toHaveBeenCalledWith('sess_1', {
      toolkit_slug: 'github',
      endpoint: 'https://api.github.com/user',
      method: 'GET',
      parameters: [{ name: 'X-Custom', type: 'header', value: 'val' }],
    });
    expect(result).toEqual({
      status: 200,
      data: { proxy_result: true },
    });
  });

  it('should throw on proxyExecute() with invalid params', async () => {
    const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1');
    await expect(
      ctx.proxyExecute({ toolkit: 'github', endpoint: '/test', method: 'INVALID' as any })
    ).rejects.toThrow('Invalid proxy execute parameters');
  });

  describe('sibling local tool routing', () => {
    it('should route to local tool when customToolsMap has a match', async () => {
      const siblingExecute = vi.fn().mockResolvedValue({ local: true });
      const customToolsMap = buildCustomToolsMap([
        createCustomTool('SIBLING_TOOL', {
          name: 'Sibling',
          description: 'A sibling tool',
          inputParams: z.object({ key: z.string() }),
          execute: siblingExecute,
        }),
      ]);

      const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1', customToolsMap);
      const result = await ctx.execute('SIBLING_TOOL', { key: 'val' });

      expect(siblingExecute).toHaveBeenCalledWith({ key: 'val' }, ctx);
      expect(result).toEqual({ data: { local: true }, error: null, logId: '' });
      // Should NOT call remote
      expect(mockClient.toolRouter.session.execute).not.toHaveBeenCalled();
    });

    it('should fall back to remote when slug not in customToolsMap', async () => {
      const customToolsMap = buildCustomToolsMap([
        createCustomTool('OTHER_TOOL', {
          name: 'Other',
          description: 'Not the one we call',
          inputParams: z.object({}),
          execute: vi.fn().mockResolvedValue({}),
        }),
      ]);
      mockClient.toolRouter.session.execute.mockResolvedValue({
        data: { remote: true },
        error: null,
        log_id: 'log_3',
      });

      const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1', customToolsMap);
      const result = await ctx.execute('REMOTE_TOOL', { key: 'val' });

      expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith('sess_1', {
        tool_slug: 'REMOTE_TOOL',
        arguments: { key: 'val' },
      });
      expect(result).toEqual({ data: { remote: true }, error: null, logId: 'log_3' });
    });

    it('should delegate to remote when no customToolsMap is provided', async () => {
      mockClient.toolRouter.session.execute.mockResolvedValue({
        data: { remote: true },
        error: null,
        log_id: 'log_4',
      });

      const ctx = new SessionContextImpl(mockClient as any, 'user_1', 'sess_1');
      const result = await ctx.execute('ANY_TOOL', {});

      expect(mockClient.toolRouter.session.execute).toHaveBeenCalled();
      expect(result.logId).toBe('log_4');
    });
  });
});
