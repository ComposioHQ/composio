import { Command, Options } from '@effect/cli';
import { Effect, Fiber, Option } from 'effect';
import { APP_VERSION } from 'src/constants';
import { browserLogin } from 'src/commands/login.cmd';
import { inferSkillReleaseChannel, installSkillSafe } from 'src/effects/install-skill';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  detectOnboardingTargets,
  parseTargetList,
  type OnboardingTarget,
} from 'src/onboarding/targets';

const yesOpt = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Accept detected defaults without prompts')
);

const noSkillInstallOpt = Options.boolean('no-skill-install').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip installing Composio skills into detected agents')
);

const targetsOpt = Options.text('targets').pipe(
  Options.optional,
  Options.withDescription('Comma-separated detected agents to set up, e.g. claude,codex,cursor')
);

const selectTargets = (params: {
  readonly targets: ReadonlyArray<OnboardingTarget>;
  readonly yes: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const targets = params.targets;
    if (params.yes || targets.length === 0) {
      return targets;
    }

    const selectedIds = yield* ui.multiselect(
      'Install Composio plugin + skills for:',
      targets.map(target => ({ value: target.id, label: target.label })),
      targets.map(target => target.id)
    );
    const selectedSet = new Set(selectedIds);
    return targets.filter(target => selectedSet.has(target.id));
  });

const ensureAuthenticated = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  const ui = yield* TerminalUI;

  if (Option.isSome(ctx.data.apiKey)) {
    yield* ui.log.success('Already logged in');
    return;
  }

  yield* ui.log.step('Logging you in..');
  yield* browserLogin({
    scope: 'user',
    noBrowser: false,
    noWait: false,
    skipOrgProjectPicker: false,
  });
});

const installTargets = (targets: ReadonlyArray<OnboardingTarget>) =>
  Effect.gen(function* () {
    if (targets.length === 0) {
      return;
    }

    yield* Effect.forEach(
      targets,
      target =>
        installSkillSafe({
          channel: inferSkillReleaseChannel(APP_VERSION),
          target: target.id,
        }),
      { concurrency: 1 }
    );
  });

export const onboardCmd = Command.make('onboard', {
  yes: yesOpt,
  noSkillInstall: noSkillInstallOpt,
  targets: targetsOpt,
}).pipe(
  Command.withDescription('Set up Composio login and agent skills.'),
  Command.withHandler(({ yes, noSkillInstall, targets }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;

      yield* ui.intro('composio onboard');

      const detectedTargets = yield* detectOnboardingTargets;
      const selectedCandidates = parseTargetList(Option.getOrUndefined(targets), detectedTargets);
      const selectedTargets = noSkillInstall
        ? []
        : yield* selectTargets({ targets: selectedCandidates, yes });

      if (!noSkillInstall && selectedTargets.length === 0) {
        yield* ui.log.warn('No supported agents detected. Skipping skill install.');
      }

      const installFiber = yield* Effect.fork(installTargets(selectedTargets));
      yield* ensureAuthenticated;
      yield* Fiber.join(installFiber);

      yield* ui.log.info(
        'Email connection and scan consent are completed in the browser onboarding.'
      );
      yield* ui.log.info('Suggested connections will appear in the browser onboarding flow.');
      yield* ui.outro("You're all set!");
    })
  )
);
