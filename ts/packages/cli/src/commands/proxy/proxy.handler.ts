import { Effect, Result, Option } from 'effect';
import type { SessionProxyExecuteParams } from '@composio/client/resources/tool-router/session';
import { resolveOptionalTextInput } from 'src/effects/resolve-optional-text-input';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { gateToolExecution } from 'src/services/tool-permissions';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  refreshConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { actingUser } from 'src/commands/surface';
import {
  ComposioNoActiveConnectionError,
  mapComposioError,
} from 'src/services/composio-error-overrides';
import { parseJsonRecord } from 'src/utils/parse-json';
import { toolInputRequiredError } from 'src/utils/tool-input-required';
import { resolveConnectedAccountForToolkit } from 'src/services/connected-account-selection';
import { ProxyRequestError, ReportedProxyCommandError } from './proxy.errors';
import {
  formatProxyErrorOutput,
  formatProxyNotConnectedOutput,
  formatProxyOutput,
} from './proxy.format';

/** The argument and flags of `composio proxy`. */
export type ProxyParams = {
  readonly endpoint: string;
  readonly toolkit: string;
  readonly account: Option.Option<string>;
  readonly method: string;
  readonly headers: ReadonlyArray<string>;
  readonly data: Option.Option<string>;
  readonly skipConnectionCheck: boolean;
};

type ProxyMethod = Extract<
  SessionProxyExecuteParams['method'],
  'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
>;

const SUPPORTED_PROXY_METHODS: ReadonlyArray<ProxyMethod> = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
];

export const normalizeProxyMethod = (value: string): ProxyMethod => {
  const normalized = value.trim().toUpperCase();
  const supported = SUPPORTED_PROXY_METHODS.find(method => method === normalized);
  if (!supported) {
    throw new Error('Unsupported method. Use one of GET, POST, PUT, DELETE, PATCH.');
  }
  return supported;
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

export const parseProxyBody = (raw: string): unknown =>
  Result.getOrElse(parseJsonRecord(raw), (): unknown => raw);

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
    } else {
      yield* params.ui.log.error(mapped.message);
    }
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
      Effect.catch(() => Effect.void),
      Effect.forkDetach,
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
        formatProxyNotConnectedOutput({
          error: message,
          toolkit: params.toolkit,
          endpoint: params.endpoint,
        })
      );
      return yield* new ReportedProxyCommandError({
        message,
        toolkit: params.toolkit,
        endpoint: params.endpoint,
      });
    }
  });

export const runProxy = (params: ProxyParams) =>
  Effect.gen(function* () {
    const { endpoint, toolkit, account, method, headers, data, skipConnectionCheck } = params;
    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const { userId: consumerUserId, project: resolvedProject } = yield* actingUser();
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
    const headerParameters: NonNullable<SessionProxyExecuteParams['parameters']> = headers.map(
      header => {
        const parsed = parseProxyHeader(header);
        return {
          name: parsed.name,
          type: 'header',
          value: parsed.value,
        };
      }
    );
    const rawBody = yield* resolveBodyInput(data);
    const parsedBody = rawBody === undefined ? undefined : parseProxyBody(rawBody);

    const result = yield* ui.withSpinner(
      `Proxying ${normalizedMethod} ${endpoint} via ${normalizedToolkit}...`,
      Effect.gen(function* () {
        const client = yield* clientSingleton.getFor({
          orgId: resolvedProject.orgId,
          projectId: resolvedProject.projectId,
        });
        // Always resolve through here, even with no --account: this is what
        // makes the "multiple accounts, none aliased default" case fail
        // loudly instead of resolveToolRouterSession silently picking one
        // via resolveDefaultConnectedAccountsByToolkit.
        const selectedConnectedAccountId = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: normalizedToolkit,
          userId: consumerUserId,
          selector: account,
        });
        const { sessionId, permissionSnapshot, connectedAccounts, connectedAccountWordIds } =
          yield* resolveToolRouterSession(client, consumerUserId, {
            toolkits: [normalizedToolkit],
            connectedAccounts: selectedConnectedAccountId
              ? { [normalizedToolkit]: selectedConnectedAccountId }
              : undefined,
            cacheScope: {
              orgId: resolvedProject.orgId,
              projectId: resolvedProject.projectId,
              consumerUserId,
            },
          });

        // Same consumer permission gate as `composio execute`, checked against
        // the account the session will use (explicit `--account` or default).
        yield* gateToolExecution({
          toolSlug: normalizedToolkit,
          connectedAccountId: connectedAccounts?.[normalizedToolkit],
          connectedAccountWordId: connectedAccountWordIds?.[normalizedToolkit],
          snapshot: permissionSnapshot,
        });

        const failed = (cause: unknown) =>
          new ProxyRequestError({
            message: `Failed to proxy ${normalizedMethod} ${endpoint} via "${normalizedToolkit}".`,
            cause,
          });

        return yield* client.toolRouter.session
          .proxyExecute(
            sessionId,
            {
              toolkit_slug: normalizedToolkit,
              endpoint,
              method: normalizedMethod,
              ...(parsedBody !== undefined ? { body: parsedBody } : {}),
              ...(headerParameters.length > 0 ? { parameters: headerParameters } : {}),
            }
            // A proxied call is not `idempotent`, so it is sent once: a retry
            // after the upstream API already acted duplicates the side
            // effect. The response is not validated either, for the same
            // reason.
          )
          .pipe(
            Effect.mapError(failed),
            Effect.flatMap(response => {
              if (response.result_type === 'input_required') {
                return Effect.fail(
                  failed(
                    toolInputRequiredError(
                      `${normalizedMethod} proxy call via "${normalizedToolkit}"`,
                      response
                    )
                  )
                );
              }
              // A session hook blocked the request: there is no HTTP
              // response to print, only the hook's message.
              if (response.result_type === 'blocked') {
                return Effect.fail(
                  new ProxyRequestError({
                    message: `${normalizedMethod} proxy call via "${normalizedToolkit}" was blocked by session hook "${response.reason.hook_id}": ${response.message}`,
                    cause: response.reason,
                  })
                );
              }
              return Effect.succeed(response);
            }),
            Effect.matchEffect({
              onFailure: error =>
                handleProxyExecutionError({
                  ui,
                  error,
                  toolkit: normalizedToolkit,
                  endpoint,
                }),
              onSuccess: Effect.succeed,
            })
          );
      })
    );

    const output = formatProxyOutput(result);
    yield* ui.log.info(`Status: ${String(result.status ?? 'unknown')}`);
    if (output) {
      yield* ui.note(output, 'Proxy Response');
      yield* ui.output(output);
    }
  });
