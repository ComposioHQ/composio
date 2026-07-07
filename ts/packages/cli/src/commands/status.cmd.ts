import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { APP_VERSION } from 'src/constants';
import { DOCS_SKILL_NAME } from 'src/effects/install-skill';
import { detectOnboardingTargets } from 'src/onboarding/targets';
import { getSessionInfoByUserApiKey } from 'src/services/composio-clients';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';

/**
 * One-shot machine-readable setup probe, built for agents: everything a
 * setup playbook needs to decide its next step, in one stdout JSON object —
 * CLI version, login state, detected agents, and installed skills.
 */
export const statusCmd = Command.make('status', {}).pipe(
  Command.withDescription('Show setup status: version, login, detected agents, skills (JSON).'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      const os = yield* NodeOs;

      const apiKey = ctx.data.apiKey;
      const loggedIn = Option.isSome(apiKey);
      const sessionInfo = loggedIn
        ? yield* getSessionInfoByUserApiKey({
            baseURL: ctx.data.baseURL,
            userApiKey: Option.getOrElse(apiKey, () => ''),
          }).pipe(Effect.option)
        : Option.none<never>();

      const detected = yield* detectOnboardingTargets;
      const skillsDir = path.join(os.homedir, '.agents', 'skills');
      const hasSkill = (name: string) => fs.existsSync(path.join(skillsDir, name));

      const status = {
        version: APP_VERSION,
        logged_in: loggedIn,
        email: Option.map(sessionInfo, info => info.org_member.email).pipe(Option.getOrNull),
        org: Option.map(sessionInfo, info => info.project.org.name).pipe(Option.getOrNull),
        detected_agents: detected.map(target => target.id),
        skills: {
          'composio-cli': hasSkill('composio-cli'),
          [DOCS_SKILL_NAME]: hasSkill(DOCS_SKILL_NAME),
        },
      };

      if (!loggedIn) {
        yield* ui.log.warn('Not logged in. Run `composio login` (or `composio onboard`).');
      }
      if (!status.skills['composio-cli'] || !status.skills[DOCS_SKILL_NAME]) {
        yield* ui.log.step('Install agent skills with:\n> composio onboard --yes');
      }

      yield* ui.output(JSON.stringify(status, null, 2));
    })
  )
);
