# composio-typesafe

Lets TypeSafe's Jev model pick and run Composio tools from a plain-language request, with a confidence score on every decision.

Jev is not an LLM and has no tool calling. It takes a state plus typed questions and returns calibrated probabilities in about 100 ms. This provider compiles your Composio tools into those questions, asks Jev, and gives you back one of three things: a `call`, a `partial` call, or an `abstain`.

## Installation

```bash
pip install composio composio-typesafe typesafe-sdk==0.6.0
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `TYPESAFE_API_KEY` in your environment.

Pin `typesafe-sdk` to an exact version. It is a young 0.x package and 0.6.0 was a breaking release, so this provider accepts `>=0.6.0,<0.7.0` only.

## Quickstart

Get tools with `composio.tools.get(user_id=...)`, call `decide` with the request, then `execute` the decision.

```python
from composio import Composio
from composio_typesafe import TypesafeProvider

provider = TypesafeProvider()
composio = Composio(provider=provider)

tool_set = composio.tools.get(
    user_id="user_123",
    tools=["GITHUB_LIST_REPOSITORY_ISSUES", "GITHUB_CREATE_AN_ISSUE"],
)

decision = provider.decide(
    tool_set,
    "List the closed issues of the composio repository owned by ComposioHQ",
)

if decision["kind"] == "abstain":
    print(f"No tool call: {decision['reason']}", decision["candidates"])
else:
    # Jev bound `state="closed"`. The owner and the repository name are free text,
    # so you supply them.
    print(decision["tool"], decision["arguments"], decision["confidence"])
    result = provider.execute(
        "user_123",
        decision,
        arguments={"owner": "ComposioHQ", "repo": "composio"},
    )
    print(result["data"])
```

`TypesafeProvider()` and `composio.tools.get()` work offline with no TypeSafe key. The TypeSafe client is built on the first `decide`.

In async code, call `adecide`. It uses `AsyncTypeSafeClient` and returns the same decision:

```python
decision = await provider.adecide(tool_set, "List the closed issues of composio")
```

## Most decisions are partial calls, and that is the point

Jev answers closed questions. It never writes text. So the provider splits every tool argument into one of two groups:

- **Closed-set arguments** are enums, booleans, and arrays of enum values. Each one becomes a question, and Jev binds the value.
- **Open-ended arguments** are everything else: free text, numbers, dates, IDs, and objects. They get no question. You supply them.

A `partial` decision names the tool, the arguments Jev bound, and the required arguments still `missing`. Complete it with caller arguments in `execute`:

```python
if decision["kind"] == "partial":
    print(decision["missing"])  # [["owner"], ["repo"]]
    provider.execute(
        "user_123",
        decision,
        arguments={"owner": "ComposioHQ", "repo": "composio"},
    )
```

Caller arguments win over Jev-bound values. Only an absent key counts as missing, so `None` is a value. If you already know some arguments before deciding, pass them to `decide` as `arguments`. They get no question and do not affect the confidence.

Every closed-set question has a "not stated" outcome. When the request does not mention a required argument, it lands in `missing` instead of being bound to the nearest option. When it does not mention an optional argument, the argument is left out. The provider never injects a schema default, so server-side defaults stay in charge.

To let Jev bind an argument that is free text in the schema, turn it into an enum with a schema modifier:

```python
from composio import schema_modifier


@schema_modifier(tools=["GITHUB_LIST_REPOSITORY_ISSUES"])
def repo_as_enum(tool, toolkit, schema):
    schema.input_parameters["properties"]["repo"]["enum"] = [
        "composio",
        "docs",
        "examples",
    ]
    return schema


tool_set = composio.tools.get(
    user_id="user_123",
    tools=["GITHUB_LIST_REPOSITORY_ISSUES"],
    modifiers=[repo_as_enum],
)
```

Session meta tools from `session.tools()` work, but their arguments are open-ended, so they yield near-empty partial calls. Prefer `composio.tools.get(user_id=...)`.

## What the confidence means

`decision["confidence"]` is the score of the least certain judgement the call depends on: the routing answer, the action gate, and every required argument Jev bound. It is not a calibrated probability that the whole call is correct. Use it to rank and to gate, and read `decision["judgements"]` when you need the parts.

An optional argument with a weak answer is dropped, listed in `decision["dropped"]`, and does not lower the confidence. A required argument with a weak answer moves to `missing`, and its guess is kept in `decision["suggestions"]`.

## When the provider abstains

`abstain` carries a `reason` and the ranked `candidates`:

| Reason                | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `no_tools`            | The tool set is empty. No request is sent.                        |
| `empty_state`         | The request is empty. No request is sent.                         |
| `no_action_requested` | The request asks for an explanation, or says not to do something. |
| `none_fit`            | No tool carries out the request.                                  |
| `low_confidence`      | The best tool is below the routing threshold.                     |

`abstain` means only that the model judged so. API failures, timeouts, rate limits, and malformed responses raise typed errors: `TypesafeApiError`, whose `reason` is one of `rate_limit` (with `retry_after_ms`), `timeout`, `connection`, `authentication`, `server_error`, `request_rejected`, or `unknown`, and `TypesafeMalformedResponseError`. They never come back as `abstain`. Error messages hold a status code and a request ID, and never your state, argument values, or response content. No provider error chains the `typesafe-sdk` exception, so `__cause__` and `__context__` stay empty.

## Thresholds

| Threshold  | Default | Applies to                                                        |
| ---------- | ------- | ----------------------------------------------------------------- |
| `routing`  | 0.6     | The routing answer. 0.9 for a destructive tool.                   |
| `gate`     | 0.3     | The mean of three "is the user asking for an action now" answers. |
| `argument` | 0.6     | Each argument Jev binds.                                          |

These follow TypeSafe's guidance, which calls them examples to tune. Set them per provider or per `decide` call:

```python
provider = TypesafeProvider(
    thresholds={"routing": 0.7, "argument": 0.8},
)

provider.decide(tool_set, request, thresholds={"gate": 0.5})
```

`jev-latest` is the default model, and it moves. A new model can shift what a threshold means, so pin a versioned model ID in production with `TypesafeProvider(model=...)`. Every decision echoes the resolved model in `decision["meta"]["model"]`.

## Destructive tools need confirmation

A tool tagged `destructiveHint` routes at a threshold of 0.9, and its decision has `requires_confirmation: True`. `execute` refuses it until you confirm explicitly:

```python
provider.execute("user_123", decision, confirm=True)
```

`execute` decides from the decision's stored `risk` class, so clearing `requires_confirmation` alone does not skip confirmation. A stored decision is only as trustworthy as its storage: whoever can edit it can edit `risk` too. Sign a decision that crosses a trust boundary, or derive it again on the other side. No threshold lowers the 0.9 floor. When the state comes from an untrusted source, leave destructive tools out of the tool set.

## Request and context

State is a string, or `{"request": ..., "context": ...}`. Put what the user asked for in `request`, and supporting material such as an email thread or a record in `context`.

```python
provider.decide(
    tool_set,
    {
        "request": "Label this issue as a bug",
        "context": {"issue": {"title": "Login fails", "body": "..."}},
    },
)
```

A state mapping takes `request` and `context` and nothing else. Any other top-level key raises `TypesafeInvalidOptionsError`, because it would not be sent, so a misspelled `context` fails loudly. A value that is not JSON raises the same error: `nan` and infinite floats, `bytes`, `datetime`, `Decimal`, `UUID`, sets, other objects, and a `dict` with a key that is not a string. Serialize those before you pass them. The provider never drops or replaces a value.

By default the split is structural. Routing and the action gate see `request` only, so text inside `context` cannot change which tool is picked or whether any action is taken. Only argument questions see `context`. This costs a second request.

What this does not cover: `context` can still move closed-set argument values, a string state has no split, and `request` is trusted input. Pass `context_scope="all"` when you need `context` to take part in routing. That opts out of the separation. Any value other than `"arguments"` or `"all"` raises `TypesafeInvalidOptionsError`.

## Decisions are plain JSON

A decision is a plain `dict` that survives `json.dumps`, so you can queue it for approval and run it later. `execute` needs no tool set and makes no request to TypeSafe. Parse a stored decision with the exported `parse_decision` if you want to validate it yourself.

A stored decision is as trusted as its storage, `risk` and `requires_confirmation` included. It runs against the toolkit version that resolves at execution time, which can differ from `decision["meta"]["tool_version"]`. A decision made by the Python SDK is not portable to the TypeScript SDK.

`execute` also accepts the session that produced the tools instead of a user ID: `provider.execute(session=session, decision=decision)`. A session takes no modifiers.

## Companion helpers

Both helpers work with any other Composio provider.

### `shortlist_tools`

Rank raw tools against a request and keep the top `k`, then hand those to an LLM provider. It accepts up to 254 tools. `ashortlist_tools` is the async form.

```python
raw = composio.tools.get_raw_composio_tools(toolkits=["github"], limit=100)
shortlist = provider.shortlist_tools(raw, "open an issue", k=5)
openai_tools = openai_composio.tools.get(
    user_id="user_123",
    tools=[tool.slug for tool in shortlist["tools"]],
)
```

### `confidence_gate`

Build a `before_execute` modifier that asks Jev whether a tool call an LLM proposed matches what the user asked for, and vetoes it when it does not.

```python
# One gate per agent run. Reuse it for every retry inside that run.
gate = provider.confidence_gate(
    tools=raw,
    get_request=lambda context: (
        user_message
    ),  # user-authored text only, never LLM output
    redact_arguments=lambda slug, arguments: {**arguments, "password": "[redacted]"},
)

composio.tools.execute(
    "GITHUB_CREATE_AN_ISSUE",
    arguments,
    user_id="user_123",
    modifiers=[gate],
)
```

- A veto raises `TypesafeGateVetoError`. After `max_vetoes` vetoes (default 3) the gate blocks every later call in the run, so a hijacked LLM cannot vary arguments until one passes. Create a fresh gate for each new run. Never share a gate across users or runs, and never recreate it for each retry.
- One gate checks one call at a time, so parallel calls cannot get past `max_vetoes` together. Parallel calls through the same gate wait for each other. Separate gates do not.
- `redact_arguments` gets a deep copy of the arguments and must return a `dict` with string keys that masks the arguments it got: the same JSON structure (same keys, same array lengths) with every leaf replaced by a value of the same JSON type. The call that runs keeps its original arguments. Anything that deletes or adds a key, changes an array's length, or retypes a value blocks the call, because Jev must approve exactly the call that runs.
- When TypeSafe cannot be reached the gate blocks with `TypesafeGateUnavailableError`. `on_unavailable="allow"` lets those calls through and reports each one to `on_bypass`. A tool the gate was not given, an oversized call, a malformed response, and arguments or context that hold a value that is not JSON always block. The gate never truncates or drops a value to make a call fit.
- The gate checks that a call is consistent with the request. It is not an authorization check. File uploads run before `before_execute`, so a veto happens after the upload.
- The gate covers direct execution only. A session applies no modifiers on `session.execute`.
- The gate is synchronous, like `composio.tools.execute`, so it needs a synchronous TypeSafe client.

## What leaves for TypeSafe

Sent to `api.typesafe.ai`: the state, tool names and descriptions (custom tools included), enum values, and the arguments of calls you gate.

Never sent: your Composio API key, user IDs, connected account IDs, and custom auth parameters.

Check how [TypeSafe](https://docs.typesafe.ai) retains request data before you send personal data. When the provider builds the client, it sets the process-wide `typesafe_sdk` logger to `warn` before every request, even if `TYPESAFE_LOG_LEVEL=debug` is set, because `debug` prints request bodies, state included. An injected `client` logs however you configured it, and the provider leaves the logger alone. `typesafe-sdk` also honors `TYPESAFE_BASE_URL`, so your API key and your state go to whatever host that variable names.

## Limits

- One decision per `decide` call. A multi-intent request such as "create an issue and notify Slack" is not split.
- A tool set holds at most 254 tools. More raises `TypesafeLimitError`.
- A state that exceeds the request budget raises `TypesafeLimitError`. The provider never truncates state.
- Closed-set properties nested inside object arguments are open-ended.
- Root-level `allOf`, `anyOf`, and `oneOf` raise `TypesafeInvalidOptionsError` when wrapping a tool. Use a flat object schema with top-level `properties` and `required`; requirements inside root composition are not supported.
- `execute` takes a user ID with modifiers, or a session. It has no `connected_account_id` option yet.

## Links

- [TypeSafe documentation](https://docs.typesafe.ai)
- [Composio documentation](https://docs.composio.dev)
