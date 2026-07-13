import { FileSystem } from '@effect/platform';
import { Effect } from 'effect';
import path from 'node:path';
import { inferSkillReleaseChannel, installSkill } from 'src/effects/install-skill';
import { APP_VERSION } from 'src/constants';
import { NodeOs } from './node-os';

export class SetupSkillInstaller extends Effect.Service<SetupSkillInstaller>()(
  'services/SetupSkillInstaller',
  {
    sync: () => ({
      isClaudeSkillInstalled: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const os = yield* NodeOs;
        return yield* fs.exists(path.join(os.homedir, '.claude', 'skills', 'composio-cli'));
      }),
      ensureClaudeSkill: Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const os = yield* NodeOs;
        const target = path.join(os.homedir, '.claude', 'skills', 'composio-cli');
        if (yield* fs.exists(target)) return false;

        yield* installSkill({
          target: 'claude',
          channel: inferSkillReleaseChannel(APP_VERSION),
        });
        return true;
      }),
    }),
    dependencies: [],
  }
) {}
