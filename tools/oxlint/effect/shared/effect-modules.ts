import type { ESTree, Scope, SourceCode, Variable } from '@oxlint/plugins';

/** Resolve an identifier node to its binding by walking lexical scopes upward. */
export function resolveIdentifier(
  sourceCode: SourceCode,
  identifier: ESTree.Node & { readonly name: string }
): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

/** Effect modules whose members the Effect rules recognize. */
export type EffectModule = 'Context' | 'Effect' | 'Layer' | 'ManagedRuntime';

const effectModules: ReadonlySet<string> = new Set<EffectModule>([
  'Context',
  'Effect',
  'Layer',
  'ManagedRuntime',
]);

/** Local names bound to each Effect module by the file's imports. */
export interface EffectModuleNames {
  readonly sourceCode: SourceCode;
  readonly modules: ReadonlyMap<EffectModule, ReadonlySet<string>>;
}

const isEffectModule = (name: string): name is EffectModule => effectModules.has(name);

const importedName = (specifier: ESTree.ImportSpecifier): string =>
  specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;

/** Collect `import { Effect } from "effect"` and `import * as Effect from "effect/Effect"` bindings. */
export function collectEffectModuleNames(sourceCode: SourceCode): EffectModuleNames {
  const names = new Map<EffectModule, Set<string>>();
  const add = (module: EffectModule, local: string) => {
    const existing = names.get(module) ?? new Set<string>();
    existing.add(local);
    names.set(module, existing);
  };

  for (const statement of sourceCode.ast.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    const source = statement.source.value;
    if (source === 'effect') {
      for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const name = importedName(specifier);
        if (isEffectModule(name)) add(name, specifier.local.name);
      }
      continue;
    }
    const module = source.startsWith('effect/') ? source.slice('effect/'.length) : '';
    if (!isEffectModule(module)) continue;
    for (const specifier of statement.specifiers) {
      if (
        specifier.type === 'ImportNamespaceSpecifier' ||
        specifier.type === 'ImportDefaultSpecifier'
      ) {
        add(module, specifier.local.name);
      }
    }
  }

  return { sourceCode, modules: names };
}

/** Strip parentheses, type assertions and instantiation expressions from an expression. */
export function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSInstantiationExpression'
  ) {
    current = current.expression;
  }
  return current;
}

/** Like {@link unwrapExpression}, for any node. */
export function unwrapNode(node: ESTree.Node): ESTree.Node {
  let current = node;
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSInstantiationExpression'
  ) {
    current = current.expression;
  }
  return current;
}

/** The member name when `node` is `<module>.<member>` for one of the module's local names, else null. */
export function moduleMemberName(
  node: ESTree.Node | null | undefined,
  names: EffectModuleNames,
  module: EffectModule
): string | null {
  if (node === null || node === undefined) return null;
  const expression = node.type === 'TSInstantiationExpression' ? node.expression : node;
  if (
    expression.type !== 'MemberExpression' ||
    expression.computed ||
    expression.object.type !== 'Identifier' ||
    !(names.modules.get(module)?.has(expression.object.name) ?? false) ||
    expression.property.type !== 'Identifier'
  ) {
    return null;
  }
  const binding = resolveIdentifier(names.sourceCode, expression.object);
  if (!binding?.defs.some(definition => definition.type === 'ImportBinding')) return null;
  return expression.property.name;
}

/** The member name when `node` is a call of `<module>.<member>(...)`, else null. */
export function moduleCallName(
  node: ESTree.Node | null | undefined,
  names: EffectModuleNames,
  module: EffectModule
): string | null {
  return node?.type === 'CallExpression'
    ? moduleMemberName(unwrapExpression(node.callee), names, module)
    : null;
}

/** The parts of `class X extends Context.Service<...>()("key", options) {}`. */
export interface ServiceClass {
  readonly node: ESTree.Class;
  readonly name: string | null;
  readonly options: ESTree.ObjectExpression | null;
}

/** Read a Context.Service class declaration, or null when the class is not one. */
export function serviceClass(node: ESTree.Class, names: EffectModuleNames): ServiceClass | null {
  if (node.superClass === null) return null;
  const superClass = unwrapExpression(node.superClass);
  if (superClass.type !== 'CallExpression') return null;
  const factory = unwrapExpression(superClass.callee);
  if (
    factory.type !== 'CallExpression' ||
    moduleMemberName(unwrapExpression(factory.callee), names, 'Context') !== 'Service'
  ) {
    return null;
  }
  const optionsArgument = superClass.arguments[1];
  const options =
    optionsArgument !== undefined && optionsArgument.type !== 'SpreadElement'
      ? unwrapExpression(optionsArgument)
      : null;
  return {
    node,
    name: node.id?.name ?? null,
    options: options?.type === 'ObjectExpression' ? options : null,
  };
}

/** The name of a non-computed property key, or null. */
export function keyName(key: ESTree.Node): string | null {
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
}

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

/** Whether the file is a `*.test.*` or `*.spec.*` file. */
export const isTestFile = (filename: string): boolean =>
  TEST_FILE.test(filename.replaceAll('\\', '/'));

const skippedKeys: ReadonlySet<string> = new Set(['parent', 'loc', 'range', 'start', 'end']);

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';

/** Visit every descendant of `node`. Return false from `visit` to skip a node's children. */
export function walk(node: ESTree.Node, visit: (node: ESTree.Node) => boolean): void {
  if (!visit(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (skippedKeys.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) walk(item, visit);
      }
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

/** A function expression, arrow, or declaration. */
export type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

/** Whether `node` is a function expression, arrow, or declaration. */
export const isFunction = (node: ESTree.Node | null | undefined): node is FunctionNode =>
  node?.type === 'ArrowFunctionExpression' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'FunctionDeclaration';

/** The return statements of a function body, without descending into nested functions. */
export function ownReturns(body: ESTree.Node): readonly ESTree.ReturnStatement[] {
  const returns: ESTree.ReturnStatement[] = [];
  walk(body, node => {
    if (node !== body && isFunction(node)) return false;
    if (node.type === 'ReturnStatement') returns.push(node);
    return true;
  });
  return returns;
}

/** The expressions a function produces: its expression body or the arguments of its own returns. */
export function returnedExpressions(fn: FunctionNode): readonly ESTree.Expression[] {
  if (fn.body === null) return [];
  if (fn.body.type !== 'BlockStatement') return [fn.body];
  return ownReturns(fn.body).flatMap(statement =>
    statement.argument === null ? [] : [statement.argument]
  );
}

const isPipeMember = (node: ESTree.Node): node is ESTree.MemberExpression =>
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.property.type === 'Identifier' &&
  node.property.name === 'pipe';

/** For `x.pipe(...)`, the receiver `x`; otherwise null. */
export function pipeReceiver(node: ESTree.Node): ESTree.Expression | null {
  if (node.type !== 'CallExpression') return null;
  const callee = unwrapExpression(node.callee);
  return isPipeMember(callee) ? unwrapExpression(callee.object) : null;
}

/**
 * The steps that run before `call` when it is an argument of a pipeline-like call such as `x.pipe(a, call)`,
 * `pipe(x, a, call)`, or `Effect.fn("name")(body, a, call)`, including earlier `.pipe(...)` receivers.
 */
export function precedingSteps(call: ESTree.Node): readonly ESTree.Node[] {
  const parent = call.parent;
  if (parent?.type !== 'CallExpression') return [];
  const index = parent.arguments.findIndex(argument => argument === call);
  if (index < 0) return [];
  const steps: ESTree.Node[] = [];
  let receiver = pipeReceiver(parent);
  while (receiver !== null) {
    steps.push(receiver);
    if (receiver.type === 'CallExpression') steps.push(...receiver.arguments);
    receiver = pipeReceiver(receiver);
  }
  steps.push(...parent.arguments.slice(0, index));
  return steps;
}

/** The generator passed to `Effect.gen(...)`, or null when `node` is not such a call. */
export function genFunction(node: ESTree.Node, names: EffectModuleNames): ESTree.Function | null {
  if (moduleCallName(node, names, 'Effect') !== 'gen' || node.type !== 'CallExpression')
    return null;
  const body = node.arguments.at(-1);
  return body?.type === 'FunctionExpression' ? body : null;
}
