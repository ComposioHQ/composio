# @composio/typesafe

Lets TypeSafe's Jev model pick and run Composio tools from a plain-language request, with a confidence score on every decision.

Jev is not an LLM and has no tool calling. It takes a state plus typed questions and returns calibrated probabilities in about 100 ms. This provider compiles your Composio tools into those questions, asks Jev, and gives you back one of three things: a `call`, a `partial` call, or an `abstain`.

## Installation

```bash
npm install @composio/core @composio/typesafe @typesafe-ai/sdk@0.6.0 zod
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `TYPESAFE_API_KEY` in your environment.

Pin `@typesafe-ai/sdk` to an exact version. It is a young 0.x package and 0.6.0 was a breaking release, so this provider accepts `>=0.6.0 <0.7.0` only.

This package needs Node.js 24.17 or newer. `@typesafe-ai/sdk` 0.6.0 terminates the process after a cancelled request on older Node.js releases, even when you catch the error ([typesafe-sdk-js#2](https://github.com/typesafe-ai/typesafe-sdk-js/issues/2)).

## Quickstart

Get tools with `composio.tools.get(userId, ...)`, call `decide` with the request, then `execute` the decision.

```typescript
import { Composio } from '@composio/core';
import { TypesafeProvider } from '@composio/typesafe';

const provider = new TypesafeProvider();
const composio = new Composio({ provider });

const toolSet = await composio.tools.get('user_123', {
  tools: ['GITHUB_LIST_REPOSITORY_ISSUES', 'GITHUB_CREATE_AN_ISSUE'],
});

const decision = await provider.decide(
  toolSet,
  'List the closed issues of the composio repository owned by ComposioHQ'
);

if (decision.kind === 'abstain') {
  console.log(`No tool call: ${decision.reason}`, decision.candidates);
} else {
  // Jev bound `state: 'closed'`. The owner and the repository name are free text,
  // so you supply them.
  console.log(decision.tool, decision.arguments, decision.confidence);
  const result = await provider.execute('user_123', decision, {
    arguments: { owner: 'ComposioHQ', repo: 'composio' },
  });
  console.log(result.data);
}
```

`new TypesafeProvider()` and `composio.tools.get()` work offline with no TypeSafe key. The TypeSafe client is built on the first `decide`.

## Most decisions are partial calls, and that is the point

Jev answers closed questions. It never writes text. So the provider splits every tool argument into one of two groups:

- **Closed-set arguments** are enums, booleans, and arrays of enum values. Each one becomes a question, and Jev binds the value.
- **Open-ended arguments** are everything else: free text, numbers, dates, IDs, and objects. They get no question. You supply them.

A `partial` decision names the tool, the arguments Jev bound, and the required arguments still `missing`. Complete it with caller arguments in `execute`:

```typescript
if (decision.kind === 'partial') {
  console.log(decision.missing); // [['owner'], ['repo']]
  await provider.execute('user_123', decision, {
    arguments: { owner: 'ComposioHQ', repo: 'composio' },
  });
}
```

Caller arguments win over Jev-bound values. Only `undefined` counts as missing, so `null` is a value. If you already know some arguments before deciding, pass them to `decide` as `arguments`. They get no question and do not affect the confidence.

Every closed-set question has a "not stated" outcome. When the request does not mention a required argument, it lands in `missing` instead of being bound to the nearest option. When it does not mention an optional argument, the argument is left out. The provider never injects a schema default, so server-side defaults stay in charge.

To let Jev bind an argument that is free text in the schema, turn it into an enum with `modifySchema`:

```typescript
const toolSet = await composio.tools.get(
  'user_123',
  { tools: ['GITHUB_LIST_REPOSITORY_ISSUES'] },
  {
    modifySchema: ({ schema }) => {
      const repo = schema.inputParameters?.properties?.repo;
      if (repo) repo.enum = ['composio', 'docs', 'examples'];
      return schema;
    },
  }
);
```

Session meta tools from `session.tools()` work, but their arguments are open-ended, so they yield near-empty partial calls. Prefer `composio.tools.get(userId, ...)`.

## What the confidence means

`decision.confidence` is the score of the least certain judgement the call depends on: the routing answer, the action gate, and every required argument Jev bound. It is not a calibrated probability that the whole call is correct. Use it to rank and to gate, and read `decision.judgements` when you need the parts.

An optional argument with a weak answer is dropped, listed in `decision.dropped`, and does not lower the confidence. A required argument with a weak answer moves to `missing`, and its guess is kept in `decision.suggestions`.

## When the provider abstains

`abstain` carries a `reason` and the ranked `candidates`:

| Reason                | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `no_tools`            | The tool set is empty. No request is sent.                        |
| `empty_state`         | The request is empty. No request is sent.                         |
| `no_action_requested` | The request asks for an explanation, or says not to do something. |
| `none_fit`            | No tool carries out the request.                                  |
| `low_confidence`      | The best tool is below the routing threshold.                     |

`abstain` means only that the model judged so. API failures, timeouts, rate limits, and malformed responses throw typed errors: `TypesafeApiError`, whose `reason` is one of `rate_limit` (with `retryAfterMs`), `timeout`, `connection`, `authentication`, `server_error`, `request_rejected`, `aborted`, or `unknown`, and `TypesafeMalformedResponseError`. They never come back as `abstain`. Error messages hold a status code and a request ID, and never your state, argument values, or response content.

## Thresholds

| Threshold  | Default | Applies to                                                        |
| ---------- | ------- | ----------------------------------------------------------------- |
| `routing`  | 0.6     | The routing answer. 0.9 for a destructive tool.                   |
| `gate`     | 0.3     | The mean of three "is the user asking for an action now" answers. |
| `argument` | 0.6     | Each argument Jev binds.                                          |

These follow TypeSafe's guidance, which calls them examples to tune. Set them per provider or per `decide` call:

```typescript
const provider = new TypesafeProvider({
  thresholds: { routing: 0.7, argument: 0.8 },
});

await provider.decide(toolSet, request, { thresholds: { gate: 0.5 } });
```

`jev-latest` is the default model, and it moves. A new model can shift what a threshold means, so pin a model in production with `new TypesafeProvider({ model: 'jev-1.13.0' })`. Use the full version: the API rejects a short ID such as `jev-1.13`. Every decision echoes the version it resolved to in `decision.meta.model`, which is the value to pin.

## Destructive tools need confirmation

A tool tagged `destructiveHint` routes at a threshold of 0.9, and its decision has `requiresConfirmation: true`. `execute` refuses it until you confirm explicitly:

```typescript
await provider.execute('user_123', decision, { confirm: true });
```

`execute` decides from the stored `risk` class, not from `requiresConfirmation` alone, so clearing that flag does not skip the confirmation. A stored decision is only as trustworthy as its storage: `risk` and `tool` can be edited just as easily. Sign a decision, or derive it again with `decide`, when it crosses a trust boundary such as an approval UI or a shared queue. No threshold lowers the 0.9 floor. When the state comes from an untrusted source, leave destructive tools out of the tool set.

## Request and context

State is a string, or `{ request, context }`. Put what the user asked for in `request`, and supporting material such as an email thread or a record in `context`.

```typescript
await provider.decide(toolSet, {
  request: 'Label this issue as a bug',
  context: { issue: { title: 'Login fails', body: '...' } },
});
```

By default the split is structural. Routing and the action gate see `request` only, so text inside `context` cannot change which tool is picked or whether any action is taken. Only argument questions see `context`. This costs a second request.

What this does not cover: `context` can still move closed-set argument values, a string state has no split, and `request` is trusted input. Pass `contextScope: 'all'` when you need `context` to take part in routing. That opts out of the separation. Any other `contextScope` value throws `TypesafeInvalidOptionsError`.

A state object takes `request` and `context` only. Any other top-level key is never sent, so it throws `TypesafeInvalidOptionsError` instead of being dropped. So does a value in `context` that is not JSON, such as a `Date`, a `bigint`, a `Map`, `NaN`, or a class instance. Serialize those before you pass them.

## Decisions are plain JSON

A decision survives `JSON.stringify`, so you can queue it for approval and run it later. `execute` needs no tool set and makes no request to TypeSafe. Parse a stored decision with the exported `TypesafeDecisionSchema` if you want to validate it yourself.

A stored decision is as trusted as its storage. It runs against the toolkit version that resolves at execution time, which can differ from `decision.meta.toolVersion`. A decision made by the TypeScript SDK is not portable to the Python SDK.

`execute` also accepts the session that produced the tools instead of a user ID. A session takes no execution options and no modifiers.

## Companion helpers

Both helpers work with any other Composio provider.

### `shortlistTools`

Rank raw tools against a request and keep the top `k`, then hand those to an LLM provider. It accepts up to 254 tools.

```typescript
const raw = await composio.tools.getRawComposioTools({ toolkits: ['github'], limit: 100 });
const { tools, scores } = await provider.shortlistTools(raw, 'open an issue', { k: 5 });
const openaiTools = await openaiComposio.tools.get('user_123', {
  tools: tools.map(tool => tool.slug),
});
```

### `confidenceGate`

Build a `beforeExecute` modifier that asks Jev whether a tool call an LLM proposed matches what the user asked for, and vetoes it when it does not.

```typescript
// One gate per agent run. Reuse it for every retry inside that run.
const gate = provider.confidenceGate({
  tools: raw,
  getRequest: () => userMessage, // user-authored text only, never LLM output
  redactArguments: (slug, args) => ({ ...args, password: '[redacted]' }),
});

await composio.tools.execute('GITHUB_CREATE_AN_ISSUE', params, { beforeExecute: gate });
```

- A veto throws `TypesafeGateVetoError`. After `maxVetoes` vetoes (default 3) the gate blocks every later call in the run, so a hijacked LLM cannot vary arguments until one passes. Create a fresh gate for each new run. Never share a gate across users or runs, and never recreate it for each retry.
- When TypeSafe cannot be reached the gate blocks with `TypesafeGateUnavailableError`. `onUnavailable: 'allow'` lets those calls through and reports each one to `onBypass`. A tool the gate was not given, an oversized call, arguments or context that are not JSON, and a malformed response always block.
- `redactArguments` gets a copy of the arguments, so it can redact in place without changing the call that runs. It must return an object. Anything else blocks the call, because falling back to the original arguments would send the secrets.
- One gate checks one call at a time, so concurrent calls cannot slip past `maxVetoes`. Separate gates run in parallel.
- The gate checks that a call is consistent with the request. It is not an authorization check. File uploads run before `beforeExecute`, so a veto happens after the upload.
- The gate covers direct execution only. A session applies no modifiers on `session.execute`.

## What leaves for TypeSafe

Sent to `api.typesafe.ai`: the state, tool names and descriptions (custom tools included), enum values, and the arguments of calls you gate.

Never sent: your Composio API key, user IDs, connected account IDs, and custom auth parameters.

Check how [TypeSafe](https://docs.typesafe.ai) retains request data before you send personal data. The provider builds its client at log level `warn`, even when `TYPESAFE_LOG_LEVEL=debug` is set, because `debug` prints request bodies, state included. An injected `client` logs however you configured it. `@typesafe-ai/sdk` honors `TYPESAFE_BASE_URL`, so your API key and state go to whatever host that variable names.

## Limits

- One decision per `decide` call. A multi-intent request such as "create an issue and notify Slack" is not split.
- A tool set holds at most 254 tools. More throws `TypesafeLimitError`.
- A state that exceeds the request budget throws `TypesafeLimitError`. The provider never truncates state.
- A state object with a top-level key other than `request` and `context`, or with a value that is not JSON, throws `TypesafeInvalidOptionsError`.
- Closed-set properties nested inside object arguments are open-ended.

## Links

- [TypeSafe documentation](https://docs.typesafe.ai)
- [Composio documentation](https://docs.composio.dev)
