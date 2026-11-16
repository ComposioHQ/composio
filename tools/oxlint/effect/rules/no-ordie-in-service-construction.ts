import { defineRule } from '@oxlint/plugins';

import type { ESTree } from '@oxlint/plugins';

import {
  collectEffectModuleNames,
  isFunction,
  isTestFile,
  keyName,
  moduleCallName,
  moduleMemberName,
  serviceClass,
  type EffectModuleNames,
} from '../shared/effect-modules.ts';

const orDieMembers: ReadonlySet<string> = new Set(['orDie', 'orDieWith']);
/** Effect constructors whose function argument runs as part of the surrounding construction. */
const transparentThunks: ReadonlySet<string> = new Set(['suspend', 'sync']);
/** Effect constructors that define an operation; their arguments run when it is called, not during construction. */
const operationConstructors: ReadonlySet<string> = new Set(['fn', 'fnUntraced']);
const isLayerMemberName = (name: string): boolean =>
  name === 'layer' || /^layer[A-Z0-9_]/u.test(name);
const isLayerConstructor = (name: string | null): boolean =>
  name === 'effect' || name === 'scoped' || (name?.startsWith('unwrap') ?? false);

function isServiceClassNode(node: ESTree.Node | null, names: EffectModuleNames): boolean {
  return (
    (node?.type === 'ClassDeclaration' || node?.type === 'ClassExpression') &&
    serviceClass(node, names) !== null
  );
}

/** Whether `node`, entered from `child`, is where a service is constructed. */
function isConstructionRoot(
  node: ESTree.Node,
  child: ESTree.Node,
  names: EffectModuleNames
): boolean {
  if (
    (node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') &&
    node.static &&
    !node.computed
  ) {
    const name = keyName(node.key);
    return (
      node.value === child &&
      name !== null &&
      (name === 'make' || isLayerMemberName(name)) &&
      isServiceClassNode(node.parent.parent, names)
    );
  }
  if (
    node.type === 'Property' &&
    !node.computed &&
    node.value === child &&
    keyName(node.key) === 'make'
  ) {
    const options = node.parent;
    const superCall = options.parent;
    return (
      options.type === 'ObjectExpression' &&
      superCall?.type === 'CallExpression' &&
      isServiceClassNode(superCall.parent, names)
    );
  }
  if (node.type === 'CallExpression' && node.arguments.some(argument => argument === child)) {
    return isLayerConstructor(moduleCallName(node, names, 'Layer'));
  }
  return false;
}

/** The Effect constructor a function is passed to, such as `gen` for `Effect.gen(function* () {})`. */
function effectConstructorOf(fn: ESTree.Node, names: EffectModuleNames): string | null {
  const parent = fn.parent;
  if (parent?.type !== 'CallExpression' || !parent.arguments.some(argument => argument === fn))
    return null;
  return moduleCallName(parent, names, 'Effect');
}

/** Whether `node` is `Effect.fn(...)(...)` or `Effect.fnUntraced(...)`: an operation definition. */
function isOperationDefinition(node: ESTree.Node, names: EffectModuleNames): boolean {
  if (node.type !== 'CallExpression') return false;
  const direct = moduleCallName(node, names, 'Effect');
  if (direct !== null && operationConstructors.has(direct)) return true;
  const curried = moduleCallName(node.callee, names, 'Effect');
  return curried !== null && operationConstructors.has(curried);
}

/**
 * Whether `node` runs while the service is constructed. Construction stops at operation boundaries: functions other
 * than Effect.gen generators and suspend/sync thunks, Effect.fn definitions, object-literal properties (operations in
 * the returned service or callbacks in options), and effects a generator defines without yielding.
 */
function isInServiceConstruction(node: ESTree.Node, names: EffectModuleNames): boolean {
  let child: ESTree.Node = node;
  let current: ESTree.Node | null = node.parent;
  let yielded = false;
  while (current !== null) {
    if (isFunction(current)) {
      if (current.parent !== null && isConstructionRoot(current.parent, current, names))
        return true;
      const constructor = effectConstructorOf(current, names);
      if (constructor === 'gen') {
        if (!yielded) return false;
        yielded = false;
      } else if (constructor === null || !transparentThunks.has(constructor)) {
        return false;
      }
    } else if (isConstructionRoot(current, child, names)) {
      return true;
    } else if (current.type === 'Property' || isOperationDefinition(current, names)) {
      return false;
    } else if (current.type === 'YieldExpression' && current.delegate) {
      yielded = true;
    }
    child = current;
    current = current.parent;
  }
  return false;
}

/** Keep service construction failures typed instead of turning them into defects. */
export const noOrDieInServiceConstructionRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `Effect.orDie` while constructing a service (its make, its static layers, or Layer.effect/unwrap arguments) and `Layer.orDie` anywhere.',
    },
    messages: {
      constructionOrDie:
        "`Effect.{{member}}` turns a service construction failure into a defect. Classify the failure as a Data.TaggedError (or Schema.TaggedError when encoding is needed) and let it flow through the layer's error channel (`Layer.Layer<Service, ThatError>`), or handle it here with Effect.catchTag.",
      layerOrDie:
        "`Layer.orDie` hides this layer's construction failures as defects. Leave them in the layer's error channel as tagged errors and handle them where the runtime is built.",
    },
  },
  create(context) {
    if (isTestFile(context.filename)) return {};
    const names = collectEffectModuleNames(context.sourceCode);

    return {
      MemberExpression(node) {
        if (moduleMemberName(node, names, 'Layer') === 'orDie') {
          context.report({ node, messageId: 'layerOrDie' });
          return;
        }
        const member = moduleMemberName(node, names, 'Effect');
        if (member === null || !orDieMembers.has(member) || !isInServiceConstruction(node, names))
          return;
        context.report({ node, messageId: 'constructionOrDie', data: { member } });
      },
    };
  },
});
