import { Command, HelpDoc, Options, ValidationError } from '@effect/cli';
import { Effect, Either, Option, ParseResult, Schema } from 'effect';
import { ToolkitSlug } from 'src/models/toolkits';
import { browserLogin } from 'src/commands/login.cmd';
import { runConnectedAccountsLink } from 'src/commands/connected-accounts/commands/connected-accounts.link.cmd';
import { runToolsExecute } from 'src/commands/tools/commands/tools.execute.cmd';
import { renderOnboardHuman, serializeOnboardState } from 'src/commands/onboard-render';
import { TerminalUI } from 'src/services/terminal-ui';
import { gatherHostWiring, gatherOnboardingFacts } from 'src/services/onboarding-facts';
import { nextAgentCommand } from 'src/services/onboarding-next-command';
import { resolveOnboardingState } from 'src/services/onboarding-state';
import { clearOnboardingExecution } from 'src/services/onboarding-store';
import {
  asRecord,
  findTaskByFreeText,
  findTaskByToolkit,
  ONBOARD_TASKS,
} from 'src/services/onboarding-tasks';
import type { MintedLink } from 'src/services/onboarding-facts';
import type { NextCommandContext } from 'src/services/onboarding-next-command';
import type { OnboardingSkip, OnboardingState } from 'src/services/onboarding-state';
import type { StarterTask } from 'src/services/onboarding-tasks';

/**
 * `composio onboard` sequences four gates — host wiring, login, connect, execute — by calling the
 * existing `login`, `link`, and `execute` commands rather than reimplementing them. A human gets
 * prompts on stderr; `--json` suppresses every prompt and writes a state document to stdout.
 *
 * `resolveOnboardingState` computes gate status from facts alone — it never sees `canPrompt`,
 * stdout's TTY state, or `--json` — so the gates and `onboarded` are identical across invocation
 * modes for the same facts. The document is rendered once at the end of the flow rather than from
 * each branch, so no branch has to remember to emit it.
 *
 * Neither the first tool execution nor the optional create is undone by re-running the command, so
 * each requires explicit consent — see `mayRunReadDemo` and `offerReversibleCreate`.
 */

const SKIP_STEPS = ['connect', 'execute'] as const;

const invalidValue = (message: string) => ValidationError.invalidValue(HelpDoc.p(message));

const toolkitOption = Options.text('toolkit').pipe(
  Options.withDescription('Toolkit to connect and demo (e.g. "github", "gmail")'),
  Options.optional
);

const taskOption = Options.text('task').pipe(
  Options.withDescription('Starter task to run, by id or free text (e.g. "read my inbox")'),
  Options.optional
);

const jsonOption = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription(
    'Emit the state document on stdout, suppress every prompt, and never write data'
  )
);

const yesOption = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Pre-answer the read demo confirm and the org picker')
);

const statusOption = Options.boolean('status').pipe(
  Options.withDefault(false),
  Options.withDescription('Report where you are without advancing any gate')
);

const skipOption = Options.choice('skip', SKIP_STEPS).pipe(
  Options.repeated,
  Options.withDescription('Skip a step for this invocation only: connect or execute')
);

const resetOption = Options.boolean('reset').pipe(
  Options.withDefault(false),
  Options.withDescription('Forget the recorded first execution and start the demo over')
);

/**
 * `Options.text` accepts the empty string, so the ValidationError does not arrive for free. Both
 * text options are checked before any fact is gathered, so an empty value cannot produce a partial
 * document.
 */
const requireNonEmpty = (flag: string, value: Option.Option<string>) =>
  Effect.gen(function* () {
    if (Option.isNone(value)) {
      return Option.none<string>();
    }
    const trimmed = value.value.trim();
    if (trimmed.length === 0) {
      return yield* Effect.fail(invalidValue(`\`--${flag}\` cannot be empty.`));
    }
    return Option.some(trimmed);
  });

const decodeToolkitSlug = Schema.decodeUnknownEither(ToolkitSlug);

/**
 * `--toolkit` names a real toolkit slug or it names nothing.
 *
 * Two things go wrong without this. Slugs are lowercase everywhere the API and the curated registry
 * compare them, so `--toolkit GitHub` would never match a connected account and the connect gate
 * could never converge — it would keep minting links. And the value is interpolated into
 * `next_command` and into `human_action`, both of which callers execute, so a value carrying shell
 * metacharacters has to be refused at the boundary rather than quoted at the sink.
 */
const requireToolkitSlug = (flag: string, value: Option.Option<string>) =>
  Effect.gen(function* () {
    const trimmed = yield* requireNonEmpty(flag, value);
    if (Option.isNone(trimmed)) {
      return Option.none<string>();
    }

    const decoded = decodeToolkitSlug(trimmed.value.toLowerCase());
    if (Either.isLeft(decoded)) {
      return yield* Effect.fail(
        invalidValue(
          `\`--${flag}\` is not a toolkit slug. ${ParseResult.TreeFormatter.formatErrorSync(decoded.left)}`
        )
      );
    }
    return Option.some(decoded.right);
  });

/**
 * Resolve the caller's stated target. `--toolkit` names it directly; `--task` goes through the
 * curated registry, and free text that matches no entry is *not* coerced into a toolkit — a
 * near-miss falls through to the connect gate's `toolkit_required` block rather than silently
 * choosing a provider to authenticate against.
 */
const resolveRequestedToolkit = (params: {
  readonly toolkit: Option.Option<string>;
  readonly task: Option.Option<string>;
}): Option.Option<string> =>
  Option.orElse(params.toolkit, () =>
    Option.flatMap(params.task, text =>
      Option.map(findTaskByFreeText(text), matched => matched.toolkit)
    )
  );

const taskFor = (state: OnboardingState): Option.Option<StarterTask> =>
  Option.flatMap(Option.fromNullable(state.toolkit), findTaskByToolkit);

/**
 * The interactive task picker.
 *
 * Deliberately not built on `ui.select`'s defaulting: `ui.select` returns `options[0].value` both
 * when prompting is unavailable and when the user cancels, so a picker built on it would silently
 * pick the first curated task and then authorize against a provider nobody chose. `selectOption`
 * reports the absence instead, and the caller stops. The caller also checks `canPrompt` itself
 * before ever getting here.
 */
const pickStarterTask = Effect.gen(function* () {
  const ui = yield* TerminalUI;

  return yield* ui.selectOption(
    'Pick what you want to do first',
    ONBOARD_TASKS.map(task => ({
      value: task.toolkit,
      label: task.label,
      hint: task.toolkit,
    }))
  );
});

/**
 * Both tool calls onboard makes go through here.
 *
 * `quiet` keeps the raw provider response off the state document's stream — and out of whatever the
 * agent is logging — from a step whose whole purpose is to prove the connection works. `inlineOnly`
 * keeps the delegate's behavior independent of response size.
 */
const runOnboardTool = (params: {
  readonly slug: string;
  readonly args: Readonly<Record<string, unknown>>;
}) =>
  runToolsExecute({
    slug: params.slug,
    data: Option.some(JSON.stringify(params.args)),
    file: Option.none(),
    account: Option.none(),
    userId: Option.none(),
    projectName: Option.none(),
    surface: 'root',
    projectMode: 'consumer',
    getSchema: false,
    dryRun: false,
    skipConnectionCheck: false,
    skipToolParamsCheck: false,
    skipChecks: false,
    quiet: true,
    inlineOnly: true,
  }).pipe(Effect.either);

/**
 * The optional create that writes real data. Four independent conditions, all required:
 *
 * 1. A human is at the keyboard and `--json` is absent.
 * 2. The read demo already succeeded on this invocation.
 * 3. An explicit confirm defaulting to `false` returned `true`. `--yes` does **not** satisfy this;
 *    the flag most likely to end up in a shell alias is the worst place to put a write.
 * 4. Every required argument was supplied by the human at a prompt.
 *
 * Condition 3's default is `false` specifically so a mis-wired non-prompting path degrades to *not
 * writing*: `ui.confirm` returns its default when prompting is unavailable, so the fallback is a
 * refusal. Condition 4 makes the same guarantee structurally — with nobody at the keyboard there is
 * no source for `owner`/`repo`, so the write cannot be assembled at all.
 *
 * The outcome never reaches `gates`: declining, or the create failing, still leaves
 * `onboarded: true`.
 */
const offerReversibleCreate = (params: {
  readonly task: StarterTask;
  readonly interactive: boolean;
}) =>
  Effect.gen(function* () {
    const create = params.task.create;
    if (create === undefined || !params.interactive) {
      return;
    }

    const ui = yield* TerminalUI;
    const confirmed = yield* ui.confirm(create.confirmLabel, { defaultValue: false });
    if (!confirmed) {
      return;
    }

    const args: Record<string, unknown> = { ...(create.fixedArgs ?? {}) };
    for (const required of create.requiredArgs) {
      const answer = yield* ui.text(required.prompt, { placeholder: required.placeholder });
      if (Option.isNone(answer)) {
        // A cancelled or empty answer aborts. It never falls back to a default: a defaulted
        // `owner`/`repo` would write into someone else's repository.
        yield* ui.log.warn(`No ${required.key} given — skipping the create.`);
        return;
      }
      args[required.key] = answer.value;
    }

    const result = yield* runOnboardTool({ slug: create.slug, args });

    if (Either.isLeft(result)) {
      yield* ui.log.warn('The create did not go through. Onboarding is still complete.');
      return;
    }

    // `data` is an arbitrary provider payload typed `unknown`, so it is narrowed rather than
    // asserted — a response that is an array or a primitive summarizes to nothing.
    const summary =
      result.right.kind === 'tool_execution'
        ? create.summarize?.(asRecord(result.right.data) ?? {})
        : undefined;
    yield* ui.log.success(summary ?? 'Created it.');
  });

/** Whether the read demo may fire on this invocation. */
const mayRunReadDemo = (params: {
  readonly interactive: boolean;
  readonly requestedToolkit: Option.Option<string>;
  /** A spoken yes for a target the caller did not name: the confirm below, or `--yes`. */
  readonly confirmed: boolean;
}) =>
  // Naming the target on this invocation is the consent: `--toolkit github` says which account gets
  // read. Without a named target the only other consent is an explicit answer, and there is nobody
  // to ask unless a human is at the keyboard.
  Option.isSome(params.requestedToolkit) || (params.interactive && params.confirmed);

/**
 * What an advance attempt did, beyond the value it produced.
 *
 * `failed` exists so the caller can tell a delegate that could not do its job from a delegate that
 * had nothing to do. Collapsing the two would hide the failure from the human *and* leave the loop
 * looking at unchanged facts, so it would re-run the delegate and repeat its side effect.
 */
type LoginAdvance =
  | { readonly kind: 'pending'; readonly loginUrl: string }
  /**
   * The account this invocation authenticated. It is the one case `gates.login.email` is populated
   * for — the address is not persisted anywhere, so a resumed invocation has nothing to report.
   */
  | { readonly kind: 'linked'; readonly email: Option.Option<string> }
  | { readonly kind: 'failed' };

type ConnectAdvance =
  | {
      readonly kind: 'pending';
      readonly toolkit: string;
      readonly url: string;
      readonly connectedAccountId: string;
    }
  | { readonly kind: 'settled' }
  | { readonly kind: 'failed' };

type ExecuteAdvance = { readonly kind: 'ran' } | { readonly kind: 'failed' };

const advanceLoginGate = (params: { readonly yes: boolean; readonly interactive: boolean }) =>
  Effect.gen(function* () {
    const outcome = yield* browserLogin({
      scope: 'user',
      embedded: true,
      noBrowser: !params.interactive,
      noWait: !params.interactive,
      skipOrgProjectPicker: params.yes || !params.interactive,
    }).pipe(Effect.either);

    if (Either.isLeft(outcome)) {
      return { kind: 'failed' } satisfies LoginAdvance;
    }

    return (
      outcome.right.status === 'pending'
        ? { kind: 'pending', loginUrl: outcome.right.loginUrl }
        : { kind: 'linked', email: Option.fromNullable(outcome.right.email) }
    ) satisfies LoginAdvance;
  });

const advanceConnectGate = (params: { readonly toolkit: string; readonly interactive: boolean }) =>
  Effect.gen(function* () {
    const outcome = yield* runConnectedAccountsLink({
      toolkit: Option.some(params.toolkit),
      authConfig: Option.none(),
      userId: Option.none(),
      projectName: Option.none(),
      // A human at the keyboard gets the same connect `composio link` gives them: the browser opens
      // and the delegate polls to ACTIVE, so one session can reach the execute gate. `noWait` also
      // controls whether the delegate reads `noBrowser` at all, so both are pinned together.
      // Non-prompting callers keep one gate per invocation: onboard re-resolves from the API instead
      // of holding a poll open, so an agent's loop stays externally visible.
      noWait: !params.interactive,
      noBrowser: !params.interactive,
      alias: Option.none(),
      list: false,
      rootOnly: true,
      // Required, not tidiness: without it the delegate's own payload lands on the same stdout that
      // carries the state document, and "stdout carries only the document" becomes false.
      quiet: true,
    }).pipe(Effect.either);

    if (Either.isLeft(outcome)) {
      return { kind: 'failed' } satisfies ConnectAdvance;
    }

    // The authorization URL is the one thing the connect gate cannot re-derive from the API on the
    // next resolve, so it travels back with the outcome — together with the account id, which is
    // what lets the fact survive a list call that has not caught up yet.
    if (outcome.right.kind === 'pending') {
      return {
        kind: 'pending',
        toolkit: outcome.right.toolkit,
        url: outcome.right.redirectUrl,
        connectedAccountId: outcome.right.connectedAccountId,
      } satisfies ConnectAdvance;
    }

    return (
      outcome.right.kind === 'linked' ? { kind: 'settled' } : { kind: 'failed' }
    ) satisfies ConnectAdvance;
  });

const advanceExecuteGate = (params: {
  readonly task: StarterTask;
  readonly interactive: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    const result = yield* runOnboardTool({
      slug: params.task.read.slug,
      args: params.task.read.args,
    });

    if (Either.isLeft(result)) {
      yield* ui.log.error(`The demo tool did not run. ${params.task.read.slug} failed.`);
      return { kind: 'failed' } satisfies ExecuteAdvance;
    }

    // The create is offered only after the read actually succeeded, which is a distinction this
    // delegate could not make before it returned a typed outcome. Anything other than an execution
    // is a failure to report, not a silent return.
    if (result.right.kind !== 'tool_execution') {
      yield* ui.log.error(`The demo tool did not run. ${params.task.read.slug} did not execute.`);
      return { kind: 'failed' } satisfies ExecuteAdvance;
    }

    const summary = params.task.read.summarize?.(asRecord(result.right.data) ?? {});
    yield* ui.log.success(summary ?? `${params.task.read.slug} ran successfully.`);

    yield* offerReversibleCreate({ task: params.task, interactive: params.interactive });
    return { kind: 'ran' } satisfies ExecuteAdvance;
  });

const runOnboard = (params: {
  readonly toolkit: Option.Option<string>;
  readonly task: Option.Option<string>;
  readonly json: boolean;
  readonly yes: boolean;
  readonly status: boolean;
  readonly skip: ReadonlyArray<OnboardingSkip>;
  readonly reset: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const toolkitOpt = yield* requireToolkitSlug('toolkit', params.toolkit);
    const taskOpt = yield* requireNonEmpty('task', params.task);

    if (params.reset) {
      yield* clearOnboardingExecution;
    }

    const { canPrompt } = yield* ui.capabilities;
    // `--json` suppresses prompts by branching on a flag, not on a stream: without it, "`--json` on
    // a pty" would be indistinguishable from interactive and an agent would sit on a prompt forever.
    const interactive = canPrompt && !params.json;

    // `--task` resolves through the curated registry, whose slugs are literals in this repository,
    // so the value that reaches the gates is a slug on both paths.
    let requestedToolkit = resolveRequestedToolkit({ toolkit: toolkitOpt, task: taskOpt });
    let loginContext: NextCommandContext = {};
    let mintedRedirectUrl = Option.none<MintedLink>();
    // Held beside `mintedRedirectUrl` for the same reason: it belongs to this invocation, not to
    // any fact the next invocation could read back.
    let loginEmail = Option.none<string>();
    let demoFailure = Option.none<string>();

    // Probed once for the whole invocation: only `composio setup` rewrites plugin wiring, so no gate
    // this command advances can change what the probe reports.
    const hostWiring = yield* gatherHostWiring;

    const resolve = (toolkit: Option.Option<string>) =>
      Effect.map(
        gatherOnboardingFacts({
          requestedToolkit: toolkit,
          invocationSkips: params.skip,
          mintedRedirectUrl,
          email: loginEmail,
          hostWiring,
        }),
        resolveOnboardingState
      );

    let state = yield* resolve(requestedToolkit);

    // Interactively, walk as far as the gates allow so a human is not asked to re-run three times.
    // Non-prompting, advance at most one gate so an agent's loop stays externally visible.
    // `--status` advances nothing at all, so it simply skips the loop rather than returning early —
    // the emitter below stays the only place a document is written.
    const maxAdvances = params.status ? 0 : interactive ? 3 : 1;

    // `stop` means the attempt never started, so the facts cannot have moved and re-resolving would
    // only ask the same question again.
    const attemptGate = (gate: Exclude<OnboardingState['nextGate'], null>) =>
      Effect.gen(function* () {
        switch (gate) {
          case 'login': {
            const outcome = yield* advanceLoginGate({ yes: params.yes, interactive });
            loginContext = outcome.kind === 'pending' ? { loginUrl: outcome.loginUrl } : {};
            if (outcome.kind === 'linked') {
              loginEmail = outcome.email;
            }
            if (outcome.kind === 'failed') {
              yield* ui.log.error('Login did not complete. Run `composio onboard` again to retry.');
            }
            return 'attempted' as const;
          }

          case 'connect': {
            const status = state.gates.connect.status;
            if (status === 'blocked' || status === 'unknown') {
              return 'stop' as const;
            }

            let target = requestedToolkit;
            if (Option.isNone(target)) {
              // The picker is the only way to resolve a toolkit here, and it needs a human. Checked
              // directly rather than relying on `ui.select` defaulting — that defaulting is exactly
              // how a piped invocation would pick a task and then fire a real API call.
              if (!interactive) return 'stop' as const;
              const picked = yield* pickStarterTask;
              // Cancelling the picker is not a choice. Adopting the first entry here would authorize
              // a provider the user just declined to choose.
              if (Option.isNone(picked)) return 'stop' as const;
              target = picked;
              requestedToolkit = picked;
            }

            const outcome = yield* advanceConnectGate({ toolkit: target.value, interactive });
            if (outcome.kind === 'failed') {
              yield* ui.log.error(
                `Could not start authorization for ${target.value}. Run \`composio onboard\` again to retry.`
              );
            }
            mintedRedirectUrl =
              outcome.kind === 'pending'
                ? Option.some({
                    toolkit: outcome.toolkit,
                    url: outcome.url,
                    connectedAccountId: outcome.connectedAccountId,
                  })
                : Option.none<MintedLink>();
            return 'attempted' as const;
          }

          case 'execute': {
            const task = taskFor(state);
            if (Option.isNone(task)) return 'stop' as const;

            // Consent for a target the caller never named. `--yes` pre-answers it, which is what the
            // flag already promises; the default is `false` so a mis-wired path degrades to not
            // reading anything.
            let confirmed = params.yes;
            if (!confirmed && Option.isNone(requestedToolkit) && interactive) {
              confirmed = yield* ui.confirm(
                `Run ${task.value.read.slug} against your connected ${state.toolkit ?? task.value.toolkit} account?`,
                { defaultValue: false }
              );
            }
            if (!mayRunReadDemo({ interactive, requestedToolkit, confirmed })) {
              return 'stop' as const;
            }

            const outcome = yield* advanceExecuteGate({ task: task.value, interactive });
            if (outcome.kind === 'failed') {
              // The document is the only signal a non-decorating caller gets, and "attempted and
              // failed" has to be distinguishable from "not attempted" — otherwise a polling agent
              // re-fires a real API read on every iteration forever.
              demoFailure = Option.some(task.value.read.slug);
            }
            return 'attempted' as const;
          }
        }
      });

    for (let advanced = 0; advanced < maxAdvances; advanced += 1) {
      // The gate this iteration is about to attempt. Re-resolving to the same gate afterwards means
      // no fact moved, and re-running the delegate would only repeat its side effect — a second
      // OAuth session and browser tab, a second authorization link, a second real API read.
      const attempted = state.nextGate;
      if (attempted === null) break;

      if ((yield* attemptGate(attempted)) === 'stop') break;

      state = yield* resolve(requestedToolkit);
      if (state.nextGate === attempted) break;
    }

    // One emitter, at the end. Every terminal branch above falls through to here, including the ones
    // that gave up because a delegate reported nothing started or the browser step is outstanding.
    const step = nextAgentCommand(state, requestedToolkit, {
      ...loginContext,
      ...Option.match(demoFailure, {
        onNone: () => ({}),
        onSome: toolSlug => ({ failedDemoToolSlug: toolSlug }),
      }),
    });
    yield* renderOnboardHuman(state, step);
    yield* ui.output(serializeOnboardState(state, step), { force: params.json });
  });

export const onboardCmd = Command.make(
  'onboard',
  {
    toolkit: toolkitOption,
    task: taskOption,
    json: jsonOption,
    yes: yesOption,
    status: statusOption,
    skip: skipOption,
    reset: resetOption,
  },
  ({ toolkit, task, json, yes, status, skip, reset }) =>
    runOnboard({ toolkit, task, json, yes, status, skip, reset })
).pipe(
  Command.withDescription(
    [
      'Get from a fresh install to a working tool call.',
      'Sequences login, connecting an account, and running your first tool, resuming wherever you left off.',
      '',
      'Examples:',
      '  composio onboard',
      '  composio onboard --toolkit github',
      '  composio onboard --status',
      '  composio onboard --json                    Machine-readable state, no prompts',
      '',
      'See also:',
      '  composio setup                             Wire Composio into Claude Code or Codex',
      '  composio search "<query>"                  Find a tool once you are connected',
    ].join('\n')
  )
);
