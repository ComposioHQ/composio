import { Config, Effect, Layer, Schema, Stdio } from 'effect';
import { runScript, StepOutputs } from '../lib/actions.ts';
import { GitHub } from '../lib/github.ts';
import { Issues } from './issues.ts';
import { Jev } from './jev.ts';
import { Plain } from './plain.ts';
import { apply, ApplyInput, authorize, classify, WorkflowRun } from './workflow.ts';

const COMMANDS = {
  authorize,
  classify,
  apply: Effect.flatMap(ApplyInput, ({ classification, numbers }) => apply(classification, numbers)),
};

class UsageError extends Schema.TaggedError<UsageError>()('UsageError', {}) {
  override get message() {
    return `Usage: bun scripts/issue-triage/main.ts <${Object.keys(COMMANDS).join('|')}>`;
  }
}

const Command = Schema.Literals(['authorize', 'classify', 'apply']);

const GitHubIssues = Layer.unwrap(
  Effect.map(
    Config.all({ token: Config.String('GITHUB_TOKEN'), repository: Config.String('GITHUB_REPOSITORY') }),
    ({ token, repository }) => Issues.layer(repository).pipe(Layer.provide(GitHub.layer(token)))
  )
);

const main = Effect.gen(function* () {
  const [name] = yield* (yield* Stdio.Stdio).args;
  const command = yield* Schema.decodeUnknownEffect(Command)(name).pipe(Effect.mapError(() => new UsageError()));
  yield* COMMANDS[command];
}).pipe(Effect.provide(Layer.mergeAll(WorkflowRun.layer, StepOutputs.layer, GitHubIssues, Jev.layer, Plain.layer)));

if (import.meta.main) runScript(main);
