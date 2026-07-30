import { Command } from '@effect/cli'
import { FetchHttpClient } from '@effect/platform'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { finalize } from './finalize.ts'
import { prepare } from './prepare.ts'
import { status, verify } from './verify.ts'

const subcommand = <A, E, R>(name: string, description: string, effect: Effect.Effect<A, E, R>) =>
  Command.make(name, {}, () => effect).pipe(Command.withDescription(description))

const root = Command.make('sdk-release').pipe(
  Command.withDescription('Composio SDK release coordinator'),
  Command.withSubcommands([
    subcommand('prepare', 'Apply changeset bumps, sync the Python version, and draft the changelog.', prepare),
    subcommand('status', 'Report which current-version artifacts are not on npm/PyPI yet.', status),
    subcommand('verify', 'Fail unless every current-version artifact is live on its registry.', verify),
    subcommand('finalize', 'Promote the reviewed changelog draft into docs/content/changelog/.', finalize),
  ])
)

const cli = Command.run(root, { name: 'sdk-release', version: '1.0.0' })

cli(process.argv).pipe(Effect.provide(Layer.mergeAll(BunContext.layer, FetchHttpClient.layer)), BunRuntime.runMain)
