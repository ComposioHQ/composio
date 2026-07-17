import { Command, FileSystem, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import { Cause, Data, Effect, Exit, Predicate, Stream } from 'effect';
import type { MasterKind } from 'src/services/master-detector';
import {
  parseJson,
  toInvokeAgentResponse,
  type HelperDebugLog,
  type InvokeAgentNormalizedOptions,
  type InvokeAgentResponse,
  type InvokeAgentTarget,
} from 'src/services/run-subagent-shared';

class SubAgentCommandFailedError extends Data.TaggedError('SubAgentCommandFailedError')<{
  readonly command: string;
  readonly exitCode: number;
  readonly details: string;
}> {
  override get message(): string {
    const suffix = this.details ? `: ${this.details}` : '';
    return `${this.command} failed with exit code ${this.exitCode}${suffix}`;
  }
}

class SubAgentNonJsonOutputError extends Data.TaggedError('SubAgentNonJsonOutputError')<{
  readonly target: InvokeAgentTarget;
}> {
  override get message(): string {
    return `${this.target} returned non-JSON output in experimental_subAgent().`;
  }
}

const collectUtf8Text = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  Stream.mkString(Stream.decodeText(stream));

const runExternalCommandText = (
  cmd: readonly [string, ...Array<string>],
  helperDebugLog: HelperDebugLog
) =>
  Effect.gen(function* () {
    const [executable, ...commandArgs] = cmd;
    helperDebugLog('agent.spawn', { command: cmd[0], args: cmd.slice(1) });

    // The child never reads interactive input: hand it an immediately-closed
    // stdin pipe (EOF), matching the previous `stdio: ['ignore', ...]` spawn.
    const command = Command.make(executable, ...commandArgs).pipe(Command.stdin(Stream.empty));

    const [exitCode, stdout, stderr] = yield* Effect.scoped(
      Effect.flatMap(Command.start(command), child =>
        Effect.all([child.exitCode, collectUtf8Text(child.stdout), collectUtf8Text(child.stderr)], {
          concurrency: 3,
        })
      )
    );

    if (exitCode !== 0) {
      const details = stderr.trim() || stdout.trim();
      helperDebugLog('agent.error', {
        command: cmd[0],
        exitCode,
        stderr: stderr.trim() || undefined,
      });
      return yield* new SubAgentCommandFailedError({ command: executable, exitCode, details });
    }

    helperDebugLog('agent.done', {
      command: cmd[0],
      exitCode,
      stdoutBytes: stdout.length,
      stderrBytes: stderr.length,
    });
    return { stdout, stderr, exitCode };
  });

const invokeClaudeLegacy = (
  prompt: string,
  options: InvokeAgentNormalizedOptions,
  master: MasterKind,
  helperDebugLog: HelperDebugLog
) =>
  Effect.gen(function* () {
    helperDebugLog('subAgent.prepare', {
      target: 'claude',
      transport: 'legacy',
      hasSchema: options.structuredSchema !== undefined,
    });

    const args: [string, ...Array<string>] = ['claude', '--bare', '-p', '--output-format', 'json'];
    if (typeof options.model === 'string' && options.model.trim().length > 0) {
      args.push('--model', options.model.trim());
    }
    if (options.structuredSchema !== undefined) {
      args.push('--json-schema', JSON.stringify(options.structuredSchema));
    }
    args.push(prompt);

    const result = yield* runExternalCommandText(args, helperDebugLog);
    const parsed = parseJson(result.stdout.trim());
    if (!Predicate.isRecord(parsed)) {
      return yield* new SubAgentNonJsonOutputError({ target: 'claude' });
    }

    const payload =
      options.structuredSchema !== undefined
        ? {
            result: null,
            structuredOutput: parsed.structured_output ?? null,
          }
        : {
            result: typeof parsed.result === 'string' ? parsed.result : null,
            structuredOutput: null,
          };

    return toInvokeAgentResponse(master, 'claude', payload);
  });

const invokeCodexLegacy = (
  prompt: string,
  options: InvokeAgentNormalizedOptions,
  master: MasterKind,
  helperDebugLog: HelperDebugLog
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: 'composio-invoke-agent-' });
    const outputPath = path.join(tempDir, 'last-message.txt');
    const args: [string, ...Array<string>] = [
      'codex',
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '-o',
      outputPath,
    ];

    helperDebugLog('subAgent.prepare', {
      target: 'codex',
      transport: 'legacy',
      hasSchema: options.structuredSchema !== undefined,
    });

    if (typeof options.model === 'string' && options.model.trim().length > 0) {
      args.push('--model', options.model.trim());
    }

    if (options.structuredSchema !== undefined) {
      const schemaPath = path.join(tempDir, 'schema.json');
      yield* fs.writeFileString(schemaPath, JSON.stringify(options.structuredSchema));
      args.push('--output-schema', schemaPath);
    }

    args.push(prompt);
    yield* runExternalCommandText(args, helperDebugLog);

    const text = (yield* fs.readFileString(outputPath)).trim();
    if (options.structuredSchema !== undefined) {
      return toInvokeAgentResponse(master, 'codex', {
        result: null,
        structuredOutput: parseJson(text) ?? null,
      });
    }

    return toInvokeAgentResponse(master, 'codex', {
      result: text,
      structuredOutput: null,
    });
  }).pipe(Effect.scoped);

export const invokeLegacySubAgent = async ({
  prompt,
  options,
  master,
  target,
  helperDebugLog,
}: {
  prompt: string;
  options: InvokeAgentNormalizedOptions;
  master: MasterKind;
  target: InvokeAgentTarget;
  helperDebugLog: HelperDebugLog;
}): Promise<InvokeAgentResponse> => {
  const program =
    target === 'claude'
      ? invokeClaudeLegacy(prompt, options, master, helperDebugLog)
      : invokeCodexLegacy(prompt, options, master, helperDebugLog);

  const exit = await Effect.runPromiseExit(Effect.provide(program, BunContext.layer));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  // Surface the original error instance (same message callers matched on
  // before), not a FiberFailure wrapper.
  throw Cause.squash(exit.cause);
};
