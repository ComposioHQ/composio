/**
 * Pins the order in which `effect/cli` composes a command's handler with the providers and guards
 * of the groups above it. Command identity depends on it (`src/commands/registration.ts`) and the
 * framework does not document it: if an `effect` upgrade changes it, these cases fail first.
 */
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Exit, Option, Ref } from 'effect';
import { CliError, Command } from 'effect/cli';
import { NotLoggedInError } from 'src/commands/errors';
import { withRegisteredSubcommands } from 'src/commands/registration';
import { CommandSurface } from 'src/commands/surface';
import { CommandInvocation, commandPathOf, withCommandMeta } from 'src/invocation/command-identity';
import { TestLive } from 'test/__utils__';

class GuardFailed extends CliError.UserError {}

/**
 * A tree shaped like the CLI's: `app` (whose own handler shows help, like the root's overview)
 * registers `outer` (whose own handler is an action), a root shortcut to `link` with its own
 * family, a login-gated group, and a group whose own guard fails. `outer` registers `inner` (no
 * handler, aliased `in`) and the same `link` value again. Every provider, registration, `begin`,
 * and handler appends to the trace.
 */
const traced = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const trace = yield* Ref.make<ReadonlyArray<string>>([]);
    const note = (entry: string) => Ref.update(trace, entries => [...entries, entry]);
    const handler = (name: string) => () => note(`handler ${name}`);
    const provider =
      (name: string) =>
      <const Name extends string, Input, ContextInput, E, R>(
        self: Command.Command<Name, Input, ContextInput, E, R>
      ) =>
        Command.provideEffectDiscard(self, note(`provider ${name}`));

    const show = Command.make('show', {}, handler('show'));
    const link = Command.make('link', {}, handler('link'));
    const inner = Command.make('inner').pipe(
      Command.withAlias('in'),
      withRegisteredSubcommands([show]),
      provider('inner')
    );
    const outer = Command.make('outer', {}, handler('outer')).pipe(
      withRegisteredSubcommands([inner, link], { ownAction: true }),
      provider('outer')
    );
    const gated = Command.make('gated').pipe(
      withRegisteredSubcommands([Command.make('leaf', {}, handler('gated leaf'))]),
      withCommandMeta({ requiresLogin: true })
    );
    const guarded = Command.make('guarded').pipe(
      withRegisteredSubcommands([Command.make('leaf', {}, handler('guarded leaf'))]),
      Command.provideEffectDiscard(
        Effect.andThen(note('guard guarded'), Effect.fail(new GuardFailed({ cause: 'guard' })))
      )
    );
    const app = Command.make('app', {}, handler('app')).pipe(
      withRegisteredSubcommands([
        outer,
        link.pipe(withCommandMeta({ telemetryFamily: 'link' })),
        gated,
        guarded,
      ]),
      provider('app')
    );

    const exit = yield* Command.runWith(app, { version: '1.0.0' })(args).pipe(
      Effect.provideService(CommandInvocation, {
        begin: (identity, input) =>
          note(
            `begin ${commandPathOf(identity)} ${identity.meta.telemetryFamily}${Option.isSome(input) ? '' : ' unparsed'}`
          ),
        enter: identity => note(`enter ${commandPathOf(identity)}`),
        runId: Effect.succeedNone,
      }),
      Effect.provide(CommandSurface.root),
      Effect.exit
    );
    return { exit, trace: yield* Ref.get(trace) };
  });

const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Exit.findErrorOption(exit)) : undefined;

describe('effect/cli handler composition', () => {
  layer(TestLive())(it => {
    it.effect.each([
      {
        name: 'a nested leaf runs inside every ancestor provider, outermost first',
        args: ['outer', 'inner', 'show'],
        trace: [
          'provider app',
          'enter outer',
          'provider outer',
          'enter outer inner',
          'provider inner',
          'enter outer inner show',
          'begin outer inner show command',
          'handler show',
        ],
      },
      {
        name: 'an alias resolves to the canonical registration',
        args: ['outer', 'in', 'show'],
        trace: [
          'provider app',
          'enter outer',
          'provider outer',
          'enter outer inner',
          'provider inner',
          'enter outer inner show',
          'begin outer inner show command',
          'handler show',
        ],
      },
      {
        name: 'a bare group with its own action begins it with its input, no subcommand',
        args: ['outer'],
        trace: [
          'provider app',
          'enter outer',
          'provider outer',
          'begin outer command',
          'handler outer',
        ],
      },
      {
        name: 'the root with no subcommand begins as help, then runs its own handler',
        args: [],
        trace: ['provider app', 'begin composio command unparsed', 'handler app'],
      },
      {
        name: 'a root shortcut is its own registration, with its own meta',
        args: ['link'],
        trace: ['provider app', 'enter link', 'begin link link', 'handler link'],
      },
      {
        name: 'the same value registered in a group has the group path and no root meta',
        args: ['outer', 'link'],
        trace: [
          'provider app',
          'enter outer',
          'provider outer',
          'enter outer link',
          'begin outer link command',
          'handler link',
        ],
      },
    ])('$name', ({ args, trace }) =>
      Effect.gen(function* () {
        const result = yield* traced(args);
        expect(Exit.isSuccess(result.exit)).toBe(true);
        expect(result.trace).toEqual(trace);
      })
    );

    it.effect('a bare group without a handler begins as help, then shows its help', () =>
      Effect.gen(function* () {
        const { exit, trace } = yield* traced(['outer', 'inner']);
        expect(trace).toEqual([
          'provider app',
          'enter outer',
          'provider outer',
          'enter outer inner',
          'provider inner',
          'begin outer inner command unparsed',
        ]);
        expect(failureOf(exit)).toMatchObject({
          _tag: 'ShowHelp',
          commandPath: ['app', 'outer', 'inner'],
          errors: [],
        });
      })
    );

    it.effect('a login a group requires is checked after the selected command began', () =>
      Effect.gen(function* () {
        const { exit, trace } = yield* traced(['gated', 'leaf']);
        expect(trace).toEqual([
          'provider app',
          'enter gated',
          'enter gated leaf',
          'begin gated leaf command',
        ]);
        expect(failureOf(exit)).toBeInstanceOf(NotLoggedInError);
      })
    );

    // A guard a group pipes on itself wraps its whole dispatch, so it runs before the selected
    // command is reached: only the registrations entered so far are known. A required login is
    // `CommandMeta` for this reason, and so is a shared flag a command cannot honor.
    it.effect('a group-level guard runs before the selected command begins', () =>
      Effect.gen(function* () {
        const { exit, trace } = yield* traced(['guarded', 'leaf']);
        expect(trace).toEqual(['provider app', 'enter guarded', 'guard guarded']);
        expect(failureOf(exit)).toBeInstanceOf(GuardFailed);
      })
    );

    it.effect('a parse failure runs no provider, and names the canonical path reached', () =>
      Effect.gen(function* () {
        const { exit, trace } = yield* traced(['outer', 'in', 'shw']);
        expect(trace).toEqual([]);
        expect(failureOf(exit)).toMatchObject({
          _tag: 'ShowHelp',
          commandPath: ['app', 'outer', 'inner'],
          errors: [{ _tag: 'UnknownSubcommand', subcommand: 'shw' }],
        });
      })
    );

    it.effect.each([
      {
        flag: '--help',
        args: ['outer', 'in', '--help'],
        begun: 'begin outer inner command unparsed',
      },
      { flag: '--version', args: ['link', '--version'], begun: 'begin link link unparsed' },
    ])('$flag begins the command it answers for, and runs no handler', ({ args, begun }) =>
      Effect.gen(function* () {
        const { exit, trace } = yield* traced(args);
        expect(Exit.isSuccess(exit)).toBe(true);
        expect(trace).toEqual([begun]);
      })
    );
  });
});
