import { Args, Command, Options } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { Effect, Option } from 'effect';
import { parse as parseJsonWithComments } from 'comment-json';
import { readStdin, readStdinIfPiped } from 'src/effects/read-stdin';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  resolveCommandProject,
  formatResolveCommandProjectError,
} from 'src/services/command-project';

const endpoint = Args.text({ name: 'url' }).pipe(
  Args.withDescription('Absolute or relative API endpoint to call through proxy execute.')
);

const toolkit = Options.text('toolkit').pipe(
  Options.withAlias('t'),
  Options.withDescription('Toolkit slug whose connected account should be used')
);

const method = Options.text('method').pipe(
  Options.withAlias('X'),
  Options.withDefault('GET'),
  Options.withDescription('HTTP method, curl-style (GET, POST, PUT, DELETE, PATCH)')
);

const headers = Options.text('header').pipe(
  Options.withAlias('H'),
  Options.withDescription('Header in "Name: value" format. Repeat for multiple headers.'),
  Options.repeated
);

const data = Options.text('data').pipe(
  Options.withAlias('d'),
  Options.withDescription('Request body as raw text, JSON, @file, or - for stdin'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.optional,
  Options.withDescription('Developer-project user ID override')
);

const projectName = Options.text('project-name').pipe(
  Options.optional,
  Options.withDescription('Developer project name override for this command')
);

const SUPPORTED_PROXY_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

export const normalizeProxyMethod = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  if (!SUPPORTED_PROXY_METHODS.includes(normalized as (typeof SUPPORTED_PROXY_METHODS)[number])) {
    throw new Error('Unsupported method. Use one of GET, POST, PUT, DELETE, PATCH.');
  }
  return normalized;
};

export const parseProxyHeader = (value: string): { name: string; value: string } => {
  const idx = value.indexOf(':');
  if (idx <= 0) {
    throw new Error(`Invalid header "${value}". Use "Name: value".`);
  }

  const name = value.slice(0, idx).trim();
  const headerValue = value.slice(idx + 1).trim();
  if (!name) {
    throw new Error(`Invalid header "${value}". Missing header name.`);
  }
  return { name, value: headerValue };
};

const resolveBodyInput = (input: Option.Option<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (Option.isSome(input)) {
      const value = input.value.trim();
      if (value === '-') {
        return yield* readStdin;
      }
      if (value.startsWith('@')) {
        const filePath = value.slice(1).trim();
        if (!filePath) {
          return yield* Effect.fail(new Error('Missing file path after "@" in --data'));
        }
        return yield* fs.readFileString(filePath, 'utf-8');
      }
      return value;
    }

    const piped = yield* readStdinIfPiped;
    return Option.getOrUndefined(piped);
  });

export const parseProxyBody = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    try {
      return parseJsonWithComments(raw, undefined, true) as unknown;
    } catch {
      try {
        return Function(`"use strict"; return (${raw});`)() as unknown;
      } catch {
        return raw;
      }
    }
  }
};

const formatProxyOutput = (result: {
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
  binary_data?: unknown;
}) => {
  if (result.binary_data) {
    return JSON.stringify(
      {
        status: result.status ?? null,
        headers: result.headers ?? {},
        binary_data: result.binary_data,
      },
      null,
      2
    );
  }

  if (typeof result.data === 'string') {
    return result.data;
  }

  if (result.data === undefined || result.data === null) {
    return '';
  }

  return JSON.stringify(result.data, null, 2);
};

export const proxyCmd = Command.make('proxy', {
  endpoint,
  toolkit,
  method,
  headers,
  data,
  userId,
  projectName,
}).pipe(
  Command.withDescription(
    [
      'Call a toolkit API through Composio proxy execute using curl-style flags.',
      '',
      'Examples:',
      '  composio proxy https://gmail.googleapis.com/gmail/v1/users/me/profile --toolkit gmail',
      `  composio proxy https://gmail.googleapis.com/gmail/v1/users/me/drafts --toolkit gmail -X POST -H 'content-type: application/json' -d '{"message":{"raw":"..."}}'`,
    ].join('\n')
  ),
  Command.withHandler(params =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const userContext = yield* ComposioUserContext;
      const clientSingleton = yield* ComposioClientSingleton;
      const resolvedProject = yield* resolveCommandProject({
        mode: 'consumer',
        projectName: Option.getOrUndefined(params.projectName),
      }).pipe(Effect.mapError(formatResolveCommandProjectError));

      const resolvedUserId =
        resolvedProject.projectType === 'CONSUMER'
          ? Option.fromNullable(resolvedProject.consumerUserId)
          : Option.match(params.userId, {
              onSome: value => Option.some(value),
              onNone: () => userContext.data.testUserId,
            });

      if (Option.isNone(resolvedUserId)) {
        return yield* Effect.fail(
          new Error(
            'Missing user id. Provide --user-id or run composio login to set global test_user_id.'
          )
        );
      }

      const normalizedMethod = normalizeProxyMethod(params.method);
      const headerParameters = params.headers.map(header => {
        const parsed = parseProxyHeader(header);
        return {
          name: parsed.name,
          type: 'header' as const,
          value: parsed.value,
        };
      });
      const rawBody = yield* resolveBodyInput(params.data);
      const parsedBody = rawBody === undefined ? undefined : parseProxyBody(rawBody);

      const result = yield* ui.withSpinner(
        `Proxying ${normalizedMethod} ${params.endpoint} via ${params.toolkit}...`,
        Effect.gen(function* () {
          const client = yield* clientSingleton.getFor({
            orgId: resolvedProject.orgId,
            projectId: resolvedProject.projectId,
          });
          const { sessionId } = yield* resolveToolRouterSession(client, resolvedUserId.value, {
            toolkits: [params.toolkit],
          });

          return yield* Effect.tryPromise(() =>
            client.toolRouter.session.proxyExecute(sessionId, {
              toolkit_slug: params.toolkit,
              endpoint: params.endpoint,
              method: normalizedMethod,
              ...(parsedBody !== undefined ? { body: parsedBody } : {}),
              ...(headerParameters.length > 0 ? { parameters: headerParameters } : {}),
            })
          );
        })
      );

      const output = formatProxyOutput(result as Record<string, unknown>);
      yield* ui.log.info(`Status: ${String((result as { status?: number }).status ?? 'unknown')}`);
      if (output) {
        yield* ui.note(output, 'Proxy Response');
        yield* ui.output(output);
      }
    })
  )
);
