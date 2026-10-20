import ts from 'typescript';
import z from 'zod/v3';
import { join } from 'path';
import { readFileSync } from 'fs';
import * as session from '../src/types/toolRouter.types';

const ROOTS = {
  ToolRouterCreateSessionConfig: 'create-input',
  ToolRouterUpdateSessionConfig: 'update-input',
  ToolRouterSessionConfig: 'returned-config',
} as const;
const TYPE_SECTIONS: Record<string, string> = { ...ROOTS };
const slug = (text: string) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
const cell = (text: string) =>
  text.replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (text: string) => `\`${cell(text)}\``;
const sectionPage = (id: string) =>
  id.startsWith('update-input')
    ? 'session-update-options'
    : id.startsWith('returned-config')
      ? 'session-config'
      : 'session-create-options';
const link = (label: string, id: string) => `[${code(label)}](${sectionPage(id)}#${id})`;

/** Link only documented public type names, including names inside generic types. */
export function sessionOptionTypeLinks(type: string): string | undefined {
  const names = [...new Set(type.match(/\b[A-Za-z][A-Za-z0-9_]*\b/g) ?? [])].filter(
    name => TYPE_SECTIONS[name]
  );
  return names.length ? names.map(name => link(name, TYPE_SECTIONS[name])).join(', ') : undefined;
}

/** Keep runnable signatures intact while linking inline configuration types. */
export function linkSessionOptionOccurrences(mdx: string): string {
  let fenced = false;
  return mdx
    .split('\n')
    .map(line => {
      if (line.startsWith('```')) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line.replace(
        /\[`[^`]+`\]\([^)]*\)|`([^`]+)`/g,
        (original, type: string | undefined) => {
          if (!type) return original;
          const names = [...new Set(type.match(/\b[A-Za-z][A-Za-z0-9_]*\b/g) ?? [])].filter(
            name => TYPE_SECTIONS[name]
          );
          return names.length === 1
            ? `[${original}](${sectionPage(TYPE_SECTIONS[names[0]])}#${TYPE_SECTIONS[names[0]]})`
            : original;
        }
      );
    })
    .join('\n');
}

interface Section {
  id: string;
  title: string;
  body: string[];
}

// z.infer describes schema output: a default fills undefined, unlike an
// optional wrapper. Runtime parser acceptance is a different contract.
function isOutputOptional(value: z.ZodTypeAny): boolean {
  if (value instanceof z.ZodDefault) return false;
  if (value instanceof z.ZodEffects) return isOutputOptional(value.innerType());
  if (value instanceof z.ZodNullable) return isOutputOptional(value.unwrap());
  if (value instanceof z.ZodUnion) return value.options.some(isOutputOptional);
  return (
    value instanceof z.ZodOptional ||
    value instanceof z.ZodAny ||
    value instanceof z.ZodUnknown ||
    value instanceof z.ZodUndefined
  );
}

/** Render schemas, not their Zod implementation types. Each object alternative gets an anchor. */
export function renderSessionSchema(
  schema: z.ZodTypeAny,
  root: string,
  customTypes: Record<string, string> = {},
  schemaNames?: Record<string, string>,
  outputTypes: Record<string, string> = {}
): { text: string; sections: Section[] } {
  const sections: Section[] = [];
  const named = new Map<z.ZodTypeAny, string>();
  const rendered = new Map<z.ZodTypeAny, string>();
  for (const [name, value] of Object.entries(session)) {
    if (name.endsWith('Schema') && value instanceof z.ZodType) {
      const typeName = schemaNames ? schemaNames[name] : name.slice(0, -6);
      if (typeName) named.set(value, typeName);
    }
  }
  const unwrap = (value: z.ZodTypeAny): z.ZodTypeAny => {
    if (value instanceof z.ZodEffects) return unwrap(value.innerType());
    if (
      value instanceof z.ZodOptional ||
      value instanceof z.ZodDefault ||
      value instanceof z.ZodNullable
    )
      return unwrap(value._def.innerType);
    return value;
  };
  const description = (value: z.ZodTypeAny): string => {
    const own = value.description ?? '';
    if (value instanceof z.ZodDefault)
      return `${own} Schema default: ${code(JSON.stringify(value._def.defaultValue()))}.`.trim();
    if (value instanceof z.ZodEffects) return own || description(value.innerType());
    if (value instanceof z.ZodOptional || value instanceof z.ZodNullable)
      return own || description(value._def.innerType);
    return own;
  };
  const render = (value: z.ZodTypeAny, path: string): string => {
    const cached = rendered.get(value);
    if (cached !== undefined) return cached;
    const inner = unwrap(value);
    const name = named.get(value) ?? named.get(inner);
    const text = renderInner(value, path, name);
    rendered.set(value, text);
    if (name) {
      TYPE_SECTIONS[name] ??= path;
      if (TYPE_SECTIONS[name] === path && !sections.some(section => section.id === path))
        sections.push({ id: path, title: name, body: [`Type: ${text}`, ''] });
    }
    return text;
  };
  const renderInner = (value: z.ZodTypeAny, path: string, name?: string): string => {
    if (value instanceof z.ZodOptional)
      return `${render(value.unwrap(), path)}${isOutputOptional(value.unwrap()) ? '' : ` \\| ${code('undefined')}`}`;
    if (value instanceof z.ZodNullable)
      return `${render(value.unwrap(), path)} \\| ${code('null')}`;
    if (value instanceof z.ZodDefault)
      return render(value._def.innerType, path).replace(/ \\\| `undefined`$/, '');
    if (value instanceof z.ZodEffects) {
      if (value._def.effect.type === 'transform') {
        if (!outputTypes[path])
          throw new Error(`Missing exported output type for transform at ${path}`);
        return code(outputTypes[path]);
      }
      return render(value.innerType(), path);
    }
    if (value instanceof z.ZodObject) {
      const section: Section = { id: path, title: path.replace(`${root}-`, ''), body: [] };
      sections.push(section);
      section.body.push(
        '| Field | Type | Required | Description |',
        '|-------|------|----------|-------------|'
      );
      for (const [key, field] of Object.entries(value.shape) as [string, z.ZodTypeAny][]) {
        const type = render(field, `${path}-${slug(key)}`);
        section.body.push(
          `| ${code(key)} | ${type} | ${isOutputOptional(field) ? 'No' : 'Yes'} | ${cell(description(field))} |`
        );
      }
      return link(name ?? 'object', path);
    }
    if (value instanceof z.ZodUnion)
      return value.options
        .map((variant: z.ZodTypeAny, index: number) =>
          render(variant, `${path}-variant-${index + 1}`)
        )
        .join(' \\| ');
    if (value instanceof z.ZodArray) return `Array&lt;${render(value.element, `${path}-item`)}&gt;`;
    if (value instanceof z.ZodRecord)
      return `Record&lt;${render(value.keySchema, `${path}-key`)}, ${render(value.valueSchema, `${path}-value`)}&gt;`;
    if (value instanceof z.ZodEnum)
      return value.options.map((item: string) => code(JSON.stringify(item))).join(' \\| ');
    if (value instanceof z.ZodLiteral) return code(JSON.stringify(value.value));
    if (value instanceof z.ZodString) return code('string');
    if (value instanceof z.ZodNumber)
      return `${code('number')}${value._def.checks.length ? ` (${value._def.checks.map(check => (check.kind === 'min' || check.kind === 'max' ? `${check.kind}: ${check.value}` : check.kind)).join(', ')})` : ''}`;
    if (value instanceof z.ZodBoolean) return code('boolean');
    if (value instanceof z.ZodNever) return code('never');
    if (value instanceof z.ZodNull) return code('null');
    if (value instanceof z.ZodUnknown) return code('unknown');
    const customType = Object.entries(customTypes).find(([field]) =>
      path.endsWith(`-${slug(field)}-item`)
    )?.[1];
    if (customType) return link(customType, slug(customType));
    if (value instanceof z.ZodAny) return code('any');
    throw new Error(`Unsupported Session schema ${value._def.typeName} at ${path}`);
  };
  const text = render(schema, root);
  return { text, sections };
}

/** Resolve the returned client alias through the installed compiler program. */
export function renderReturnedConfig(
  packageDir: string,
  outputTypes?: Record<string, string>
): Section[] {
  const configPath = join(packageDir, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, packageDir);
  const sourcePath = join(packageDir, 'src/types/toolRouter.types.ts');
  const program = ts.createProgram([sourcePath], parsed.options);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(sourcePath)!;
  if (outputTypes) {
    for (const node of source.statements) {
      if (!ts.isTypeAliasDeclaration(node) || !(node.name.text in ROOTS)) continue;
      const root = ROOTS[node.name.text as keyof typeof ROOTS];
      for (const field of checker.getPropertiesOfType(checker.getTypeAtLocation(node))) {
        const declaration = field.valueDeclaration ?? field.declarations?.[0];
        if (!declaration) continue;
        const type = checker.getNonNullableType(
          checker.getTypeOfSymbolAtLocation(field, declaration)
        );
        outputTypes[`${root}-${slug(field.name)}`] = checker.typeToString(
          type,
          undefined,
          ts.TypeFormatFlags.NoTruncation
        );
      }
    }
  }
  const declaration = source.statements.find(
    (node): node is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(node) && node.name.text === 'ToolRouterSessionConfig'
  );
  if (!declaration) throw new Error('Missing ToolRouterSessionConfig');
  const rootType = checker.getTypeAtLocation(declaration);
  if (!checker.getPropertiesOfType(rootType).length)
    throw new Error(
      'Cannot resolve returned Session config; install @composio/client before generating docs'
    );
  const sections: Section[] = [];
  const seen = new Map<ts.Type, string>();
  const render = (type: ts.Type, path: string): string => {
    // A custom tool's validator and execute callback are leaf contracts, not
    // Session policy objects. Never expand the Zod implementation graph.
    if (
      type.aliasSymbol?.name === 'AnyZodSchema' ||
      checker.getSignaturesOfType(type, ts.SignatureKind.Call).length
    )
      return code(checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation));
    if (type.isUnion())
      return type.types
        .map((variant, index) => render(variant, `${path}-variant-${index + 1}`))
        .join(' \\| ');
    if (checker.isArrayType(type))
      return `Array&lt;${render(checker.getTypeArguments(type as ts.TypeReference)[0], `${path}-item`)}&gt;`;
    if (!(type.flags & ts.TypeFlags.Object))
      return code(checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation));
    const indexType = checker.getIndexTypeOfType(type, ts.IndexKind.String);
    if (indexType) return `Record&lt;${code('string')}, ${render(indexType, `${path}-value`)}&gt;`;
    const label =
      type.aliasSymbol?.name ??
      (type.symbol?.name !== '__type' ? type.symbol?.name : undefined) ??
      path.replace('returned-config-', '').replace(/-/g, '.');
    const existing = seen.get(type);
    if (existing) return link(label, existing);
    const fields = checker.getPropertiesOfType(type);
    if (!fields.length) return code(checker.typeToString(type));
    seen.set(type, path);
    const section: Section = {
      id: path,
      title: label,
      body: [
        '| Field | Type | Required | Description |',
        '|-------|------|----------|-------------|',
      ],
    };
    sections.push(section);
    for (const field of fields) {
      const declaration = field.valueDeclaration ?? field.declarations?.[0];
      if (!declaration) throw new Error(`Missing declaration for ${field.name}`);
      const fieldType = checker.getTypeOfSymbolAtLocation(field, declaration);
      section.body.push(
        `| ${code(field.name)} | ${render(fieldType, `${path}-${slug(field.name)}`)} | ${field.flags & ts.SymbolFlags.Optional ? 'No' : 'Yes'} | ${cell(ts.displayPartsToString(field.getDocumentationComment(checker)))} |`
      );
    }
    return link(label, path);
  };
  render(rootType, ROOTS.ToolRouterSessionConfig);
  for (const node of source.statements) {
    if (!ts.isTypeAliasDeclaration(node)) continue;
    const target = seen.get(checker.getTypeAtLocation(node));
    if (target) TYPE_SECTIONS[node.name.text] ??= target;
  }
  const customSource = program.getSourceFile(join(packageDir, 'src/types/customTool.types.ts'));
  for (const node of customSource?.statements ?? []) {
    if (
      !ts.isInterfaceDeclaration(node) ||
      !['CustomTool', 'CustomToolkit'].includes(node.name.text)
    )
      continue;
    const id = slug(node.name.text);
    render(checker.getTypeAtLocation(node), id);
    TYPE_SECTIONS[node.name.text] = id;
  }
  return sections;
}

export function generateSessionOptionPages(packageDir: string): Record<string, string> {
  const sourcePath = join(packageDir, 'src/types/toolRouter.types.ts');
  const source = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const customTypes: Record<string, string> = {};
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'custom' &&
      node.typeArguments?.length
    ) {
      let parent: ts.Node | undefined = node.parent;
      while (parent && !ts.isPropertyAssignment(parent)) parent = parent.parent;
      if (parent && ts.isPropertyAssignment(parent))
        customTypes[parent.name.getText(source)] = node.typeArguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const publicTypes = source.statements.filter(
    (node): node is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(node) &&
      !!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
  const schemaNames: Record<string, string> = {};
  for (const node of publicTypes) {
    if (!ts.isTypeReferenceNode(node.type)) continue;
    const query = node.type.typeArguments?.[0];
    if (query && ts.isTypeQueryNode(query))
      schemaNames[query.exprName.getText(source)] = node.name.text;
  }
  const outputTypes: Record<string, string> = {};
  const returned = renderReturnedConfig(packageDir, outputTypes);
  const create = renderSessionSchema(
    session.ToolRouterCreateSessionConfigSchema,
    ROOTS.ToolRouterCreateSessionConfig,
    customTypes,
    schemaNames,
    outputTypes
  );
  const update = renderSessionSchema(
    session.ToolRouterUpdateSessionConfigSchema,
    ROOTS.ToolRouterUpdateSessionConfig,
    customTypes,
    schemaNames,
    outputTypes
  );
  const importable = publicTypes.map(node => node.name.text).filter(name => TYPE_SECTIONS[name]);
  const renderSections = (sections: Section[]) =>
    sections
      .map(section =>
        [
          ...(Object.values(ROOTS).includes(section.id as (typeof ROOTS)[keyof typeof ROOTS])
            ? []
            : [`<a id="${section.id}" />`, '']),
          `### ${Object.values(ROOTS).includes(section.id as (typeof ROOTS)[keyof typeof ROOTS]) ? 'Fields' : section.title}`,
          '',
          ...section.body,
          '',
        ].join('\n')
      )
      .join('\n');
  const page = (title: string, description: string, content: string[]) =>
    [
      '---',
      `title: ${JSON.stringify(title)}`,
      `description: ${JSON.stringify(description)}`,
      '---',
      '',
      ...content,
    ].join('\n');
  return {
    'session-options': page(
      'Session options and config',
      'Find the create, PATCH, or returned Session configuration contract.',
      [
        'Session create options, PATCH options, and returned configuration are different contracts. Choose the one you need.',
        '',
        '| Contract | Where you use it | Omission and names |',
        '|----------|------------------|--------------------|',
        '| [Create options](session-create-options#create-input) | `composio.create(userId, options)` or `composio.sessions.create(userId, options)` | Camel-case input. Omit fields to use defaults. |',
        '| [Update options](session-update-options#update-input) | `session.update(options)` | Camel-case PATCH input. Omit to preserve; `null` removes only where permitted. |',
        '| [Returned config](session-config#returned-config) | `session.config` or the result of `session.update()` | Server-normalized snake_case fields. Not a create or PATCH input. |',
        '',
        '`toolkits` accepts toolkit slugs or a policy object. `tools` is a map keyed by toolkit slug, not a tool list. Each contract page links its full nested shapes.',
        '',
        '[Sessions](sessions) documents session creation. [Session](session) documents `update()` and `config`.',
        '',
        '## Type imports',
        '',
        'Import these public aliases from `@composio/core`. Each link opens the exact resolved contract.',
        '',
        ...importable.map(name => `- ${link(name, TYPE_SECTIONS[name])}`),
        '',
      ]
    ),
    'session-create-options': page(
      'Session create options',
      'Create-time Session options and their nested field shapes.',
      [
        '[All Session contracts](session-options)',
        '',
        '## Create input',
        '',
        '`ToolRouterCreateSessionConfig` is the second argument to `composio.create(userId, options)` and `composio.sessions.create(userId, options)`.',
        '',
        '```typescript',
        "import type { ToolRouterCreateSessionConfig } from '@composio/core';",
        '',
        "const options: ToolRouterCreateSessionConfig = { toolkits: ['gmail'], tools: { gmail: ['GMAIL_SEND_EMAIL'] } };",
        '```',
        '',
        '`toolkits` is a list of toolkit slugs or a toolkit policy object. `tools` is a map keyed by toolkit slug. Its values accept a tool list or one policy object. Nested alternatives below are separate shapes, not fields to combine.',
        '',
        'Omit a field to use the default configuration. Empty lists and maps are supplied values, not omission. Schema defaults and source descriptions below document each field; an optional outer block does not imply every nested schema default is sent.',
        '',
        'Tables describe the exported TypeScript types (`z.infer` output). A field with a schema default can still be required in its TypeScript type. For example, include `sandbox.enable` when you supply a typed sandbox config, even though the runtime parser can fill it. A schema default is not permission to omit a field marked required.',
        '',
        '`experimental.sessionConfigId` applies a saved Session config. It cannot be combined with `toolkits`, `tools`, `tags`, `experimental.customTools`, or `experimental.customToolkits`, including empty lists or maps. Per-session fields such as accounts, sandbox, and preload remain allowed.',
        '',
        'Pass either `sandbox` or its deprecated alias `workbench`, not both. `sessionPreset: "direct_tools"` defaults `manageConnections` to `false`, sandbox to `{ enable: false }`, and preload to `{ tools: "all" }`; explicit overrides win.',
        '',
        '`experimental.customTools` contains [CustomTool](#custom-tool) values and `experimental.customToolkits` contains [CustomToolkit](#custom-toolkit) values. Import these types from `@composio/core`; construct values with `createCustomTool()` / `createCustomToolkit()` from `@composio/core/experimental`.',
        '',
        renderSections(create.sections),
        '## Custom definitions',
        '',
        'Custom tool and toolkit fields below resolve the SDK interfaces. Zod validators and execute callbacks remain named leaf contracts rather than expanding their implementation internals.',
        '',
        renderSections(returned.filter(section => !section.id.startsWith('returned-config'))),
      ]
    ),
    'session-update-options': page(
      'Session update options',
      'PATCH Session options and their nested field shapes.',
      [
        '[All Session contracts](session-options)',
        '',
        '## Update input',
        '',
        '```typescript',
        "import type { ToolRouterUpdateSessionConfig } from '@composio/core';",
        '```',
        '',
        '`ToolRouterUpdateSessionConfig` is the argument to `session.update(options)`. Omit a key to keep its stored value. `null` removes an override only where the type below permits it; removal can increase access. An empty allowlist denies every app toolkit, unlike `toolkits: null`, which restores the unrestricted default.',
        '',
        'The field types follow the exported TypeScript contract. In particular, update-time `connectedAccounts` values are arrays in `ToolRouterUpdateSessionConfig`, even though its runtime parser also accepts and normalizes single account strings.',
        '',
        '`tools`, `authConfigs`, and `connectedAccounts` replace their whole stored maps. Inside `manageConnections`, `callbackUrl: null` removes only the callback URL. `instant` does not accept `null`: `false` disables it, and any policy object re-enables it, even one containing only a visibility setting.',
        '',
        '`experimental.sessionConfigId` cannot be combined with `toolkits`, `tools`, or `tags`, including `null`. Pass either `sandbox` or `workbench`, not both. A successful update refreshes `session.config` and returns the [server config](session-config#returned-config).',
        '',
        renderSections(update.sections),
      ]
    ),
    'session-config': page(
      'Session returned config',
      'Server-returned Session configuration and its nested field shapes.',
      [
        '[All Session contracts](session-options)',
        '',
        '## Returned config',
        '',
        '```typescript',
        "import type { ToolRouterSessionConfig } from '@composio/core';",
        '```',
        '',
        '`ToolRouterSessionConfig` resolves the installed client definition `SessionCreateResponse.Config`. It is not the create or PATCH input. The API uses snake_case names here, stores normalized account arrays, and returns sandbox settings under `workbench`.',
        '',
        renderSections(returned.filter(section => section.id.startsWith('returned-config'))),
      ]
    ),
  };
}
