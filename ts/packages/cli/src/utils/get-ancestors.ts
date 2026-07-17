import { Path } from '@effect/platform';
import { Effect } from 'effect';

/**
 * Walk up from a directory to the filesystem root, collecting all ancestor paths.
 * Returns an array starting with the resolved `cwd` and ending at the root.
 */
export const getAncestors = (cwd: string): Effect.Effect<string[], never, Path.Path> =>
  Effect.map(Path.Path, path => {
    const resolved = path.resolve(cwd);
    const dirs = [resolved];
    let current = resolved;

    while (true) {
      const parent = path.dirname(current);
      if (parent === current) break;
      dirs.push(parent);
      current = parent;
    }

    return dirs;
  });
