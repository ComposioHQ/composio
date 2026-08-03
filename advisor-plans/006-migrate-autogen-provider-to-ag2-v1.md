# Plan 006: Migrate the AutoGen provider to AG2 v1

> **Executor instructions**: Follow each step and run every verification. Stop
> on any condition listed below; do not improvise. When complete, update this
> plan's row in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 03291bfaa..HEAD -- python/providers/autogen python/tests/test_provider.py python/tests/test_type_inference_autogen.py docs/content/docs/providers/autogen.mdx .github/workflows/py.test.yml`
> Re-audit AG2's public imports, tool protocol, and installation metadata if any
> listed path or AG2's latest 1.x release changed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `03291bfaa`, 2026-08-03
- **Source PR**: [GitHub #4008](https://github.com/ComposioHQ/composio/pull/4008) ([Glen review](https://app.tryglen.com/review/ComposioHQ/composio/4008))

## Why this matters

AG2 is the maintained forward package. Version 1 replaces the Classic
`autogen` namespace and two-agent registration API with the `ag2` namespace,
`Agent`, and native tools. Dependabot correctly identifies the major dependency
upgrade, but its metadata-only change installs AG2 1.0.1 while the provider
still imports `autogen`; Python 3.10 therefore fails immediately with
`ModuleNotFoundError`, and the later matrix jobs are cancelled.

The safe fix is an AG2 v1 provider migration, not a switch to the legacy
`autogen` distribution. Use the [AG2 package](https://pypi.org/project/ag2/)
and its [v1 tool API](https://docs.ag2.ai/docs/user-guide/tools/tools/) as the
upstream contracts.

## Current state

- `python/providers/autogen/pyproject.toml:16` and `setup.py:25` declare
  `ag2>=0.14,<1.0` plus direct Classic-era `flaml` and `autogen_core`
  dependencies.
- `provider.py:6-8` imports `autogen`, `ConversableAgent`, and
  `autogen_core.tools.FunctionTool`.
- `provider.py:45-65` registers each tool with separate caller and executor
  agents through `autogen.agentchat.register_function`.
- `wrap_tool` already creates a deterministic function name, a schema-derived
  Python signature, and an execution closure that restores reserved keywords.
  Preserve those Composio-specific behaviors while changing the framework
  wrapper.
- `python/tests/test_provider.py` reaches into the Classic tool's private
  `_func` attribute, and `test_type_inference_autogen.py` imports the Microsoft
  `autogen_core` type. Neither assertion represents AG2 v1.
- The provider README and public docs install `ag2[openai]`, but their examples
  still import Classic `AssistantAgent`, `LLMConfig`, and `UserProxyAgent`.
- `python/providers/autogen` is not a root uv workspace member, so this package
  change must not alter root `uv.lock`.

Target AG2 1.0.1 or newer within major version 1. Keep the published
`composio-autogen` package, `composio_autogen` module, and `AutogenProvider`
class names in this migration so existing Composio imports remain valid.

## Commands

| Purpose            | Command                                                                                                                                     | Expected result                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Focused tests      | `cd python && nox -s tst -- tests/test_autogen_provider.py tests/test_provider.py`                                                          | all focused tests pass             |
| Python checks      | `cd python && nox -s chk`                                                                                                                   | exit 0                             |
| Type inference     | `cd python && nox -s type_inference`                                                                                                        | exit 0                             |
| Provider build     | `mise exec -- uv build python/providers/autogen`                                                                                            | wheel and sdist build successfully |
| Stale-import guard | `rg -n -e 'from autogen' -e 'import autogen' -e autogen_core -e flaml python/providers/autogen python/tests/test_type_inference_autogen.py` | no matches                         |
| Docs links         | `cd docs && bun run lint:links`                                                                                                             | exit 0                             |
| Docs build         | `cd docs && bun run build`                                                                                                                  | exit 0                             |
| Lockfile guard     | `git diff --exit-code -- uv.lock`                                                                                                           | exit 0; root lock unchanged        |

## Scope

**In scope**:

- `python/providers/autogen/composio_autogen/provider.py`
- `python/providers/autogen/pyproject.toml`
- `python/providers/autogen/setup.py`
- `python/providers/autogen/README.md`
- `python/tests/test_autogen_provider.py` (new)
- `python/tests/test_provider.py`
- `python/tests/test_type_inference_autogen.py`
- `docs/content/docs/providers/autogen.mdx`

**Out of scope**:

- Renaming the published package, module, provider class, or docs route.
- Supporting AG2 Classic and AG2 v1 in one provider release.
- Root `uv.lock` or root uv workspace membership.
- Unrelated Python provider migrations or historical changelogs.
- Network model calls, Composio API requests, or real API keys in tests.

## Git workflow

- Branch from the latest `origin/next`.
- Commit 1: `test(autogen): characterize AG2 v1 tool contracts`
- Commit 2: `feat(autogen): migrate provider to AG2 v1`
- Commit 3: `docs(autogen): update provider guide for AG2 v1`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Replace private Classic assertions with AG2 v1 contracts

Create `python/tests/test_autogen_provider.py` using local tool fixtures and a
fake `execute_tool` callback. Update the two existing test files so they import
and assert AG2 v1 types. Cover these contracts offline:

1. `wrap_tool` returns `ag2.tools.final.FunctionTool`, and
   `wrap_tools` returns `list[FunctionTool]` statically and at runtime.
2. `wrapped.schema.function` contains the deterministic name, Composio tool
   description, parameter types, required fields, and defaults expected from
   the generated signature. Assert the public schema instead of private
   framework attributes.
3. `schema_config={"skip_defaults": True}` makes defaulted parameters required
   in the AG2 schema; the default configuration preserves their defaults.
4. A reserved Python keyword is exposed under its safe generated parameter and
   restored before calling the fake executor.
5. Invoke the wrapped tool through AG2's async `ToolCallEvent` and `Context`
   protocol. Assert the original Composio slug, normalized arguments, and
   structured result without constructing a real model client.
6. A long tool slug produces the same valid name on repeated wraps and stays at
   or below 64 characters.
7. A model-free or stub-configured `ag2.Agent` accepts wrapped tools through
   `Agent(..., tools=tools)`, and the migrated `register_tools(agent, tools)`
   helper delegates to `Agent.add_tool` for post-construction attachment.

The initial test commit may fail because the source still uses Classic imports;
record that expected failure before migrating the implementation.

### Step 2: Migrate wrapping and registration to AG2 v1

In `provider.py`:

1. Replace Classic imports with `ag2.Agent`, `ag2.tool`, and the public AG2 v1
   `FunctionTool` type.
2. Keep the existing name hashing, schema-to-signature conversion, reserved-key
   restoration, argument normalization, and Composio execution closure.
3. Wrap the generated callable with `ag2.tool`, passing the processed name and
   description. Let AG2 derive its function schema from the generated signature
   so `skip_defaults` continues to control required/defaulted parameters.
4. Replace `register_tools(caller, executor, tools)` with
   `register_tools(agent, tools)` implemented through `Agent.add_tool`. Retain
   the helper for dynamic attachment while making `Agent(..., tools=tools)` the
   primary documented API. Do not preserve the obsolete executor parameter or
   depend on Classic runtime objects.
5. Keep tool execution synchronous inside the generated function and rely on
   AG2's default `sync_to_thread=True` behavior when the async tool protocol
   invokes it.

The old caller/executor signature is an intentional breaking change caused by
the upstream major version. Document its exact replacement in Step 4 rather
than adding a compatibility dependency on the Classic package.

### Step 3: Align package metadata with the migrated implementation

Change both metadata sources to the same `ag2>=1.0.1,<2.0` requirement. Remove
the direct `flaml==2.6.0` and `autogen_core>=0.7.5` requirements after the source
and tests no longer import them. Do not add the `autogen` distribution.

Build the provider, inspect wheel and sdist metadata, and confirm both artifacts
declare the same AG2 bound with no direct `autogen`, `autogen-core`, or FLAML
requirement. Leave package versioning to the existing Python release workflow.

### Step 4: Rewrite the quickstart for AG2 v1

Update the provider README and MDX page to:

1. Continue installing `composio`, `composio-autogen`, and `ag2[openai]`.
2. Import `Agent` from `ag2` and the current OpenAI model config from
   `ag2.config`; do not use Classic `AssistantAgent`, `UserProxyAgent`, or
   `LLMConfig`.
3. Pass `session.tools()` to `Agent(..., tools=tools)` and run the current async
   AG2 interaction method shown in upstream v1 documentation.
4. Add a short migration note mapping the old caller/executor registration call
   to constructor tools or `Agent.add_tool`.
5. Keep the note about deterministic 64-character tool names.

Validate the example against installed AG2 1.0.1 without sending a model request.
Follow `docs/AGENTS.md`; do not edit generated docs data.

### Step 5: Prove clean installs on every supported Python version

After building, run this import check independently for Python 3.10, 3.11, and
3.12:

```bash
mise exec -- uv run --isolated --no-project --python 3.10 \
  --with-editable ./python \
  --with-editable ./python/providers/autogen \
  python -c "import ag2; import composio_autogen; from ag2 import Agent"
```

Repeat with `--python 3.11` and `--python 3.12`. On one supported version, add
`--with 'ag2[openai]>=1.0.1,<2.0'` and import the exact model config used by the
quickstart. Expected: every command exits 0, resolves AG2 1.x, and does not need
the Classic `autogen` namespace.

Then run every command in the Commands table and require the repository's
Python 3.10, 3.11, and 3.12 CI jobs to complete.

## Test plan

The focused tests exercise AG2's public schema, execution event, agent tool
registration, and Composio's existing name/default/argument behavior without
network access. Static type inference, fresh-version imports, artifact metadata,
Python checks, and docs builds cover packaging and documentation regressions.

## Done criteria

- [ ] Both metadata sources require `ag2>=1.0.1,<2.0` and do not add `autogen`.
- [ ] Provider runtime and type tests use only AG2 v1 public imports.
- [ ] Tool schema, defaults, reserved arguments, long names, execution, and
      agent attachment pass focused offline tests.
- [ ] README and public docs use AG2 v1 imports and explain the caller/executor
      migration.
- [ ] Fresh imports pass on Python 3.10, 3.11, and 3.12.
- [ ] Wheel and sdist metadata agree and contain no stale direct Classic
      dependencies.
- [ ] Root `uv.lock`, package/module/class names, and unrelated providers remain
      unchanged.

## STOP conditions

- AG2's public 1.x `tool`, `FunctionTool`, `Agent`, or tool-event contract differs
  from the interfaces confirmed during the drift check.
- Preserving Composio's `skip_defaults`, reserved-key restoration, or execution
  result contract requires AG2 private attributes.
- The current quickstart cannot be constructed without a network call or secret;
  replace only the validation technique, not the documented public API.
- Fresh resolution selects AG2 2.x, installs the Classic `autogen` distribution,
  or requires a direct dependency not declared by AG2.
- Root `uv.lock` or another provider changes during resolution.
