import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import type {
  SessionProxyExecuteParams,
  SessionProxyExecuteResponse,
} from '@composio/client/resources/tool-router/session';
import { requireAuth } from 'src/effects/require-auth';
import { resolveOptionalTextInput } from 'src/effects/resolve-optional-text-input';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  refreshConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  resolveCommandProject,
  formatResolveCommandProjectError,
} from 'src/services/command-project';
import {
  ComposioNoActiveConnectionError,
  mapComposioError,
} from 'src/services/composio-error-overrides';
import { parseJsonIsh } from 'src/utils/parse-json-ish';

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

const skipConnectionCheck = Options.boolean('skip-connection-check').pipe(
  Options.withDefault(false),
  Options.withDescription(
    'Skip the short-lived connected-account fail-fast check if you just connected an account'
  )
);

type ProxyMethod = Extract<
  SessionProxyExecuteParams['method'],
  'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
>;

const SUPPORTED_PROXY_METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
] as const satisfies ReadonlyArray<ProxyMethod>;

export const normalizeProxyMethod = (value: string): ProxyMethod => {
  const normalized = value.trim().toUpperCase();
  if (!SUPPORTED_PROXY_METHODS.includes(normalized as ProxyMethod)) {
    throw new Error('Unsupported method. Use one of GET, POST, PUT, DELETE, PATCH.');
  }
  return normalized as ProxyMethod;
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

const resolveBodyInput = (input: Option.Option<string>) => resolveOptionalTextInput(input);

export const parseProxyBody = (raw: string): unknown => {
  try {
    return parseJsonIsh(raw);
  } catch {
    return raw;
  }
};

const formatProxyOutput = (
  result: Pick<SessionProxyExecuteResponse, 'status' | 'data' | 'headers' | 'binary_data'>
) => {
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

const formatProxyErrorOutput = (params: {
  readonly error: string;
  readonly toolkit: string;
  readonly endpoint: string;
  readonly slug?: string;
}) =>
  JSON.stringify(
    {
      successful: false,
      error: params.error,
      toolkit: params.toolkit,
      endpoint: params.endpoint,
      slug: params.slug ?? null,
    },
    null,
    2
  );

const handleProxyExecutionError = (params: {
  readonly ui: TerminalUI;
  readonly error: unknown;
  readonly toolkit: string;
  readonly endpoint: string;
}) =>
  Effect.gen(function* () {
    const mapped = mapComposioError({
      error: params.error,
      toolkit: params.toolkit,
    });

    if (mapped.normalized instanceof ComposioNoActiveConnectionError) {
      yield* params.ui.log.error(mapped.message);
      yield* params.ui.note(
        [
          `Link the toolkit first: composio link ${params.toolkit}`,
          'Then retry the proxy call.',
        ].join('\n'),
        'Tips'
      );
      const output = formatProxyErrorOutput({
        error: mapped.message,
        toolkit: params.toolkit,
        endpoint: params.endpoint,
        slug: mapped.slugValue,
      });
      yield* params.ui.output(output);
      return yield* Effect.fail(mapped.normalized);
    }

    yield* params.ui.log.error(mapped.message);
    const output = formatProxyErrorOutput({
      error: mapped.message,
      toolkit: params.toolkit,
      endpoint: params.endpoint,
      slug: mapped.slugValue,
    });
    yield* params.ui.output(output);
    return yield* Effect.fail(mapped.normalized);
  });

const runProxyConnectedToolkitFailFast = (params: {
  readonly toolkit: string;
  readonly ui: TerminalUI;
  readonly resolvedProject: {
    readonly projectType: 'CONSUMER' | 'DEVELOPER';
    readonly orgId: string;
  };
  readonly resolvedUserId: string;
  readonly endpoint: string;
  readonly skipConnectionCheck: boolean;
}) =>
  Effect.gen(function* () {
    if (params.skipConnectionCheck) return;
    if (params.resolvedProject.projectType !== 'CONSUMER') return;

    yield* refreshConsumerConnectedToolkitsCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    }).pipe(
      Effect.catchAll(() => Effect.void),
      Effect.forkDaemon,
      Effect.asVoid
    );

    const cachedToolkits = yield* getFreshConsumerConnectedToolkitsFromCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    });

    if (Option.isSome(cachedToolkits) && !cachedToolkits.value.includes(params.toolkit)) {
      const message = `Toolkit "${params.toolkit}" is not connected for this user (cached within the last 5 minutes). If you just connected the account, use --skip-connection-check.`;
      yield* params.ui.log.error(message);
      yield* params.ui.note(
        [
          `Link the toolkit first: composio link ${params.toolkit}`,
          'Then retry the proxy call.',
        ].join('\n'),
        'Tips'
      );
      yield* params.ui.output(
        JSON.stringify(
          {
            successful: false,
            error: message,
            toolkit: params.toolkit,
            endpoint: params.endpoint,
          },
          null,
          2
        )
      );
      return yield* Effect.fail(new Error(message));
    }
  });

export const proxyCmd = Command.make('proxy', {
  endpoint,
  toolkit,
  method,
  headers,
  data,
  skipConnectionCheck,
}).pipe(
  Command.withDescription(
    [
      'curl-like access to any toolkit API through Composio using your connected account.',
      'Composio handles authentication — just provide the full URL and toolkit.',
      '',
      'Examples:',
      '  composio proxy https://gmail.googleapis.com/gmail/v1/users/me/profile --toolkit gmail',
      `  composio proxy https://gmail.googleapis.com/gmail/v1/users/me/drafts --toolkit gmail \\`,
      `    -X POST -H 'content-type: application/json' -d '{"message":{"raw":"..."}}'`,
      '',
      'See also:',
      '  composio link <toolkit>                   Connect an account before calling proxy',
      '  composio run \'const f = await proxy("gmail"); ...\'   Use proxy in a script',
    ].join('\n')
  ),
  Command.withHandler(({ endpoint, toolkit, method, headers, data, skipConnectionCheck }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const clientSingleton = yield* ComposioClientSingleton;
      const resolvedProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
        Effect.mapError(formatResolveCommandProjectError)
      );

      if (resolvedProject.projectType !== 'CONSUMER' || !resolvedProject.consumerUserId) {
        return yield* Effect.fail(
          new Error('No consumer project user is available for proxy execution in this context.')
        );
      }
      const consumerUserId = resolvedProject.consumerUserId;
      const normalizedToolkit = toolkit.toLowerCase();

      yield* runProxyConnectedToolkitFailFast({
        toolkit: normalizedToolkit,
        ui,
        resolvedProject,
        resolvedUserId: consumerUserId,
        endpoint,
        skipConnectionCheck,
      });

      const normalizedMethod = normalizeProxyMethod(method);
      const headerParameters = headers.map(header => {
        const parsed = parseProxyHeader(header);
        return {
          name: parsed.name,
          type: 'header' as const,
          value: parsed.value,
        };
      });
      const rawBody = yield* resolveBodyInput(data);
      const parsedBody = rawBody === undefined ? undefined : parseProxyBody(rawBody);

      const result = yield* ui.withSpinner(
        `Proxying ${normalizedMethod} ${endpoint} via ${normalizedToolkit}...`,
        Effect.gen(function* () {
          const client = yield* clientSingleton.getFor({
            orgId: resolvedProject.orgId,
            projectId: resolvedProject.projectId,
          });
          const { sessionId } = yield* resolveToolRouterSession(client, consumerUserId, {
            toolkits: [normalizedToolkit],
            cacheScope: {
              orgId: resolvedProject.orgId,
              consumerUserId,
            },
          });

          const resultEither = yield* Effect.tryPromise(() =>
            client.toolRouter.session.proxyExecute(sessionId, {
              toolkit_slug: normalizedToolkit,
              endpoint,
              method: normalizedMethod,
              ...(parsedBody !== undefined ? { body: parsedBody } : {}),
              ...(headerParameters.length > 0 ? { parameters: headerParameters } : {}),
            })
          ).pipe(Effect.either);

          if (resultEither._tag === 'Left') {
            return yield* handleProxyExecutionError({
              ui,
              error: resultEither.left,
              toolkit: normalizedToolkit,
              endpoint,
            });
          }

          return resultEither.right;
        })
      );

      const output = formatProxyOutput(result);
      yield* ui.log.info(`Status: ${String(result.status ?? 'unknown')}`);
      if (output) {
        yield* ui.note(output, 'Proxy Response');
        yield* ui.output(output);
      }
    })
  )
);
