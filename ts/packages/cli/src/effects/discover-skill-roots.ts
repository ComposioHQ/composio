import { FileSystem, Path } from '@effect/platform';
import { Effect, Option } from 'effect';

const SKILL_NAME = 'composio-cli';

/**
 * Find every directory where the composio-cli skill is currently installed.
 * Known locations:
 *   ~/.agents/skills/composio-cli   (canonical install target)
 *   ~/.claude/skills/composio-cli   (Claude Code — may be a symlink or a real dir)
 *
 * We resolve symlinks so we don't rebuild the same physical directory twice,
 * but we also rebuild any real (non-symlink) copies so everything stays in sync.
 */
export const discoverSkillRoots = (home: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const candidates = [path.join(home, '.agents', 'skills'), path.join(home, '.claude', 'skills')];
    const seen = new Set<string>();
    const roots: string[] = [];

    for (const parent of candidates) {
      const skillDir = path.join(parent, SKILL_NAME);
      const link = yield* fs.readLink(skillDir).pipe(Effect.option);
      if (Option.isSome(link)) {
        const realDir = yield* fs.realPath(skillDir).pipe(Effect.option);
        if (Option.isNone(realDir)) continue;

        const realParent = path.dirname(realDir.value);
        if (!seen.has(realParent)) {
          seen.add(realParent);
          roots.push(realParent);
        }
        continue;
      }

      const stat = yield* fs.stat(skillDir).pipe(Effect.option);
      if (Option.isSome(stat) && stat.value.type === 'Directory' && !seen.has(parent)) {
        seen.add(parent);
        roots.push(parent);
      }
    }

    // Always include ~/.agents/skills as a fallback so there's at least one target
    const agentSkillsRoot = path.join(home, '.agents', 'skills');
    if (!seen.has(agentSkillsRoot)) {
      roots.push(agentSkillsRoot);
    }

    return roots;
  });
