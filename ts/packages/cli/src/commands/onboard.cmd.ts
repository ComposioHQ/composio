import { Command, Options } from '@effect/cli';
import { Effect, Fiber, Option } from 'effect';
import { browserLogin } from 'src/commands/login.cmd';
import {
  inferSkillReleaseChannel,
  installSkillBuffered,
  type SkillInstallResult,
  type SkillInstallTarget,
} from 'src/effects/install-skill';
import { detectOnboardingTargets, parseTargetList, targetLabel } from 'src/onboarding/targets';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { APP_VERSION } from 'src/constants';
import { isInteractiveTerminal } from 'src/utils/stdio';

const yesOpt = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Install for every detected agent without prompting')
);

const noSkillInstallOpt = Options.boolean('no-skill-install').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip agent skill installation')
);

const targetsOpt = Options.text('targets').pipe(
  Options.withDescription('Detected agents to configure, comma-separated'),
  Options.optional
);

const selectTargets = (params: {
  readonly detected: ReturnType<typeof detectOnboardingTargets>;
  readonly requested?: ReadonlyArray<SkillInstallTarget>;
  readonly yes: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const candidates = params.requested
      ? params.detected.filter(target => params.requested?.includes(target.id))
      : params.detected;

    if (params.requested) {
      const missing = params.requested.filter(
        requested => !params.detected.some(target => target.id === requested)
      );
      if (missing.length > 0) {
        yield* ui.log.warn(
          `Skipped undetected agent${missing.length === 1 ? '' : 's'}: ${missing.map(targetLabel).join(', ')}`
        );
      }
    }

    if (params.yes || !isInteractiveTerminal() || candidates.length === 0) {
      return candidates.map(target => target.id);
    }

    return yield* ui.multiselect(
      'Install Composio plugin + skills for:',
      candidates.map(target => ({ value: target.id, label: target.label })),
      candidates.map(target => target.id)
    );
  });

const renderInstallSummary = (results: ReadonlyArray<SkillInstallResult>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const installed = results.filter(result => result.success).map(result => result.target);
    const failed = results.filter(result => !result.success).map(result => result.target);

    if (installed.length > 0) {
      yield* ui.log.success(
        `Installed Composio skill for ${installed.map(targetLabel).join(', ')}`
      );
    }
    if (failed.length > 0) {
      yield* ui.log.warn(
        `Could not install Composio skill for ${failed.map(targetLabel).join(', ')} (non-fatal)`
      );
    }
  });

export const onboardCmd = Command.make(
  'onboard',
  {
    yes: yesOpt,
    noSkillInstall: noSkillInstallOpt,
    targets: targetsOpt,
  },
  ({ yes, noSkillInstall, targets }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const os = yield* NodeOs;
      const ctx = yield* ComposioUserContext;
      const detected = detectOnboardingTargets(os.homedir);
      const requested = Option.isSome(targets) ? parseTargetList(targets.value) : undefined;

      if (isInteractiveTerminal()) {
        yield* ui.intro('composio onboard');
      }

      if (detected.length === 0) {
        yield* ui.log.info('No supported agents detected. Continuing with account setup.');
      }

      const selected = yield* selectTargets({ detected, requested, yes });
      const installFiber = noSkillInstall
        ? undefined
        : yield* Effect.forEach(
            selected,
            target =>
              installSkillBuffered({
                target,
                channel: inferSkillReleaseChannel(APP_VERSION),
              }),
            { concurrency: 1 }
          ).pipe(Effect.fork);

      if (!ctx.isLoggedIn() || isInteractiveTerminal()) {
        yield* ui.log.step('Logging you in...');
        yield* browserLogin({
          scope: 'user',
          noBrowser: false,
          skipOrgProjectPicker: yes,
          onboarding: true,
        });
      } else {
        yield* ui.log.info('Already logged in. Run this command interactively to open onboarding.');
      }

      if (installFiber) {
        yield* Fiber.join(installFiber).pipe(Effect.flatMap(renderInstallSummary));
      }

      yield* ui.log.info(
        'Email connection and consent are completed in the browser onboarding flow.'
      );
      yield* ui.log.info(
        'Ask your agent to connect another app, or run `composio link <toolkit>`.'
      );
      yield* ui.outro("You're all set!");
    })
).pipe(
  Command.withDescription(
    'Set up your Composio account and install skills for detected coding agents.'
  )
);
