import { Config, Console, Effect, Option, Redacted, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { NPM_REGISTRY } from './lanes';
import { RELEASE_PUBLISHER } from './provenance';
import { fail } from './runtime';

/** The runbook section on npm trusted publishers, linked from every npm login failure. */
export const NPM_TRUSTED_PUBLISHING_RUNBOOK = 'ts/docs/internal/release.md#npm-trusted-publishing';

/** Where an owner changes a package's trusted publisher; the npm CLI cannot change it. */
export const npmTrustedPublisherSettings = (name: string) =>
  `npmjs.com → ${name} → Settings → Trusted publishing`;

const REQUEST_TIMEOUT = '30 seconds';

/** The audience npm requests the GitHub ID token for, as npm CLI 11.21.0 does. */
const AUDIENCE = `npm:${new URL(NPM_REGISTRY).hostname}`;

/** npm's per-package exchange endpoint; npm escapes only the scope's slash, as `%2f`. */
const exchangeUrl = (name: string) =>
  `${NPM_REGISTRY}/-/npm/v1/oidc/token/exchange/package/${name.replace('/', '%2f')}`;

const present = <A>(value: Option.Option<A>, text: (value: A) => string) =>
  Option.filter(value, item => text(item) !== '');

const IdTokenRequest = Config.all({
  url: Config.option(Config.String('ACTIONS_ID_TOKEN_REQUEST_URL')),
  token: Config.option(Config.Redacted('ACTIONS_ID_TOKEN_REQUEST_TOKEN')),
});

const IdToken = Schema.fromJsonString(Schema.Struct({ value: Schema.NonEmptyString }));
const ExchangedToken = Schema.fromJsonString(Schema.Struct({ token: Schema.NonEmptyString }));
const NpmErrorBody = Schema.fromJsonString(Schema.Struct({ message: Schema.String }));

const isSuccess = (status: number) => status >= 200 && status < 300;

/**
 * Sends one request and returns its status and body. Transport failures become a fixed message,
 * so a request's credentials can never surface in an error.
 */
const send = (request: HttpClientRequest.HttpClientRequest, failure: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(request);
    return { status: response.status, text: yield* response.text };
  }).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
    Effect.timeout(REQUEST_TIMEOUT),
    Effect.catch(() => fail(failure))
  );

/** Requests the GitHub ID token for npm, as npm does before trusted publishing. */
const githubIdToken = Effect.gen(function* () {
  const env = yield* IdTokenRequest;
  const url = present(env.url, value => value);
  const token = present(env.token, Redacted.value);
  if (Option.isNone(url) || Option.isNone(token))
    return yield* fail(
      'GitHub id-token permission missing: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are unset, so npm trusted publishing cannot log in. The publish-npm job needs `permissions: id-token: write`.'
    );
  const target = new URL(url.value);
  target.searchParams.append('audience', AUDIENCE);
  const response = yield* send(
    HttpClientRequest.get(target.href, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${Redacted.value(token.value)}`,
      },
    }),
    'The GitHub OIDC ID token request did not answer'
  );
  const body = Schema.decodeUnknownOption(IdToken)(response.text);
  if (!isSuccess(response.status) || Option.isNone(body))
    return yield* fail(`GitHub did not issue an OIDC ID token for npm (${response.status})`);
  return Redacted.make(body.value.value);
});

/** npm's reason for refusing an exchange: its `message`, else the body as it came. */
const npmReason = (text: string) =>
  Option.match(Schema.decodeUnknownOption(NpmErrorBody)(text), {
    onNone: () => text.trim() || 'empty response',
    onSome: body => body.message,
  });

/** One package's exchange; the exchanged token is checked for presence and then dropped. */
const exchange = (name: string, idToken: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const response = yield* send(
      HttpClientRequest.post(exchangeUrl(name), {
        headers: { accept: 'application/json', authorization: `Bearer ${Redacted.value(idToken)}` },
      }),
      `The npm trusted-publishing exchange for ${name} did not answer`
    );
    if (
      isSuccess(response.status) &&
      Option.isSome(Schema.decodeUnknownOption(ExchangedToken)(response.text))
    )
      return Option.none<string>();
    return Option.some(
      isSuccess(response.status)
        ? `${name} (${response.status}): npm answered without a token`
        : `${name} (${response.status}): ${npmReason(response.text)}`
    );
  });

/**
 * Logs in to npm through trusted publishing for every package, the way `npm publish` and
 * `npm dist-tag` will, and prints npm's answer for each. Fails before anything is uploaded when
 * npm refuses any of them, naming each package and npm's reason. Every planned package is
 * checked, not only the ones still missing, because moving a dist-tag needs the same login.
 */
export const checkNpmLogin = (names: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const idToken = yield* githubIdToken;
    const refusals: string[] = [];
    for (const name of names) {
      const refusal = yield* exchange(name, idToken);
      yield* Console.log(
        Option.match(refusal, {
          onNone: () => `npm trusted publishing accepted ${name}`,
          onSome: reason => `npm trusted publishing refused ${reason}`,
        })
      );
      if (Option.isSome(refusal)) refusals.push(refusal.value);
    }
    if (refusals.length > 0)
      return yield* fail(
        [
          `npm refused the trusted-publishing login for ${refusals.length} of ${names.length} packages, so nothing was uploaded:`,
          ...refusals.map(reason => `  ${reason}`),
          `Check each package's trusted publisher (${npmTrustedPublisherSettings('<package>')}): repository ${RELEASE_PUBLISHER.repository}, workflow ${RELEASE_PUBLISHER.workflow}, environment npm-release. See ${NPM_TRUSTED_PUBLISHING_RUNBOOK}.`,
        ].join('\n')
      );
  });
