import {
  type CommandIdentity,
  type CommandMetaShape,
  resolveCommandMeta,
} from 'src/invocation/command-identity';

/** The identity of a root registration at `path` that declares `meta`. */
export const commandIdentity = (
  path: ReadonlyArray<string>,
  meta: CommandMetaShape = {}
): CommandIdentity => ({ path, meta: resolveCommandMeta(undefined, meta) });
