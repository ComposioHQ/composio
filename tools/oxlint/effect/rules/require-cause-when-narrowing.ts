import { defineRule } from '@oxlint/plugins';

import type { ESTree, SourceCode } from '@oxlint/plugins';

import {
  collectEffectModuleNames,
  genFunction,
  isFunction,
  keyName,
  moduleCallName,
  moduleMemberName,
  precedingSteps,
  returnedExpressions,
  unwrapNode,
  walk,
  type EffectModuleNames,
  type FunctionNode,
} from '../shared/effect-modules.ts';

const narrowingOperators: ReadonlySet<string> = new Set([
  'mapError',
  'catch',
  'catchAll',
  'catchCause',
  'orElse',
]);
const tapOperators: ReadonlySet<string> = new Set([
  'tapError',
  'tapErrorCause',
  'tapCause',
  'tapErrorTag',
]);
const effectModuleNamesList: readonly ('Context' | 'Effect' | 'Layer' | 'ManagedRuntime')[] = [
  'Context',
  'Effect',
  'Layer',
  'ManagedRuntime',
];

/** Whether the handler never reads the error it receives. */
function ignoresError(handler: FunctionNode, sourceCode: SourceCode): boolean {
  const [parameter] = handler.params;
  if (parameter === undefined) return true;
  if (parameter.type !== 'Identifier') return false;
  const variable = sourceCode
    .getDeclaredVariables(handler)
    .find(candidate => candidate.identifiers.some(identifier => identifier === parameter));
  return variable !== undefined && variable.references.length === 0;
}

/** `new X(...)` or `X.make(...)` for a capitalized `X` that is not an Effect module. */
function isErrorConstruction(
  node: ESTree.Node,
  names: EffectModuleNames
): node is ESTree.NewExpression | ESTree.CallExpression {
  if (node.type === 'NewExpression')
    return (
      unwrapNode(node.callee).type === 'Identifier' ||
      unwrapNode(node.callee).type === 'MemberExpression'
    );
  if (node.type !== 'CallExpression') return false;
  const callee = unwrapNode(node.callee);
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier' ||
    callee.property.name !== 'make'
  ) {
    return false;
  }
  const owner = unwrapNode(callee.object);
  const ownerName =
    owner.type === 'Identifier'
      ? owner.name
      : owner.type === 'MemberExpression' && owner.property.type === 'Identifier'
        ? owner.property.name
        : null;
  if (ownerName === null || !/^[A-Z]/u.test(ownerName)) return false;
  return !effectModuleNamesList.some(module => moduleMemberName(callee, names, module) !== null);
}

/** Whether any argument is an object literal with a `cause` property or a spread that may supply one. */
function passesCause(node: ESTree.NewExpression | ESTree.CallExpression): boolean {
  return node.arguments.some(argument => {
    const expression = unwrapNode(argument);
    return (
      expression.type === 'ObjectExpression' &&
      expression.properties.some(
        property =>
          property.type === 'SpreadElement' ||
          (!property.computed && keyName(property.key) === 'cause')
      )
    );
  });
}

/** The constructed errors a handler produces without descending into nested functions. */
function constructedErrors(
  handler: FunctionNode,
  names: EffectModuleNames
): readonly (ESTree.NewExpression | ESTree.CallExpression)[] {
  const found: (ESTree.NewExpression | ESTree.CallExpression)[] = [];
  const consider = (node: ESTree.Node) => {
    const expression = unwrapNode(node);
    if (expression.type === 'YieldExpression' && expression.argument !== null) {
      consider(expression.argument);
      return;
    }
    if (isErrorConstruction(expression, names)) found.push(expression);
  };
  for (const returned of returnedExpressions(handler)) consider(returned);
  if (handler.body === null) return found;
  walk(handler.body, node => {
    // An Effect.gen generator runs as the handler's own effect; other nested functions run later, if at all.
    if (isFunction(node))
      return node.type === 'FunctionExpression' && genFunction(node.parent, names) === node;
    if (moduleCallName(node, names, 'Effect') === 'fail' && node.type === 'CallExpression') {
      const [argument] = node.arguments;
      if (argument !== undefined) consider(argument);
    }
    if (node.type === 'YieldExpression' && node.delegate && node.argument !== null)
      consider(node.argument);
    return true;
  });
  return [...new Set(found)];
}

/** Whether `node` is a call of a tap operator, or the operator itself. */
function isTapStep(node: ESTree.Node, names: EffectModuleNames): boolean {
  const expression = unwrapNode(node);
  const member =
    moduleCallName(expression, names, 'Effect') ?? moduleMemberName(expression, names, 'Effect');
  return member !== null && tapOperators.has(member);
}

/** Require narrowing handlers that replace an error to keep the original as `cause`. */
export const requireCauseWhenNarrowingRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Effect.mapError/catch/catchAll/catchCause/orElse handlers that construct a new error to keep the original error as `cause`.',
    },
    messages: {
      missingCause:
        "This {{operator}} handler discards the original error and constructs a new one without it. Name the handler's parameter and pass it as `cause` (`(error) => new {{error}}({ ..., cause: error })`), or log it first with `Effect.tapError(Effect.logError)` before narrowing.",
    },
  },
  create(context) {
    const names = collectEffectModuleNames(context.sourceCode);

    return {
      CallExpression(node) {
        const operator = moduleCallName(node, names, 'Effect');
        if (operator === null || !narrowingOperators.has(operator)) return;
        const handler = node.arguments.at(-1);
        if (handler === undefined || !isFunction(handler)) return;
        if (!ignoresError(handler, context.sourceCode)) return;
        const constructed = constructedErrors(handler, names).find(
          construction => !passesCause(construction)
        );
        if (constructed === undefined) return;
        const dataFirstSource = node.arguments.length > 1 ? node.arguments[0] : undefined;
        const earlier = dataFirstSource === undefined ? precedingSteps(node) : [dataFirstSource];
        if (earlier.some(step => isTapStep(step, names))) return;
        const callee = unwrapNode(constructed.callee);
        const errorName =
          callee.type === 'MemberExpression'
            ? context.sourceCode.getText(callee.object)
            : context.sourceCode.getText(callee);
        context.report({
          node: constructed,
          messageId: 'missingCause',
          data: { operator: `Effect.${operator}`, error: errorName },
        });
      },
    };
  },
});
