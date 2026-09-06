# Plan 003: Make Python telemetry privacy-safe and thread-correct

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b2334fb8c..HEAD -- python/composio/core/models/base.py python/composio/core/models/_telemetry.py python/composio/sdk.py python/tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (telemetry-only; no public API change — the `Composio(allow_tracking=...)` kwarg keeps its exact meaning)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b2334fb8c`, 2026-07-03

## Why this matters

Three compounding problems in the Python SDK's telemetry, all in internal code:

1. **Privacy**: on any exception in a traced SDK method, the error event ships `str(e)` and `traceback.format_exc()` to `https://telemetry.composio.dev/errors`. Exception messages routinely embed tool arguments, user IDs, file paths, and upstream API error bodies; tracebacks embed absolute local paths. This is on by default (opt-out).
2. **The opt-out is broken across threads**: `allow_tracking` is a module-global `ContextVar` set in the constructor's context. Threads (e.g. `ThreadPoolExecutor` workers — a standard way to use this sync SDK) don't inherit it, so they silently fall back to the default `True`. A user who wrote `Composio(allow_tracking=False)` still emits telemetry from worker threads. Two `Composio` instances with different flags also clobber each other.
3. **Unsynchronized init**: `_setup()` does check-then-act on module globals with no lock; concurrent first calls can spawn duplicate daemon threads and duplicate `atexit` hooks.

Fixing this before v1 matters doubly because the v1 error-catalog work will make error payloads richer, and because "privacy opt-out that doesn't work" is exactly the kind of finding that goes viral for a popular OSS SDK.

## Current state

- `python/composio/core/models/base.py:20` — `allow_tracking = contextvars.ContextVar[bool]("allow_tracking", default=True)`.
- `python/composio/core/models/base.py:32-34` — the wrapper consults it per call:
  ```python
  def trace_wrapper(self, *args: t.Any, **kwargs: t.Any) -> t.Any:
      if not allow_tracking.get():
          return method(self, *args, **kwargs)
  ```
- `python/composio/core/models/base.py:55-63` — the error payload:
  ```python
  except Exception as e:
      _, payload = event
      payload["error"] = {
          "name": e.__class__.__name__,
          "message": str(e),
          "stack": traceback.format_exc(),
      }
      event = ("error", payload)
      raise e
  ```
- `python/composio/core/models/base.py:89-91` — every `Resource` holds `self._client` (the repo-owned `composio.client.HttpClient` wrapper, NOT the generated `composio_client`).
- `python/composio/sdk.py:143` — `allow_tracking.set(kwargs.get("allow_tracking", True))`, immediately before `self._client = HttpClient(...)` (lines 144-150).
- `python/composio/core/models/_telemetry.py:90-122` — module globals `_queue`/`_event`/`_thread`, and `_setup()` doing unlocked `if X is None:` initialization including `_thread.start()` and `atexit.register(...)`.
- Conventions: repo uses `ruff` + `mypy` (config under `python/config/`), tests under `python/tests/` with pytest; snake_case; type hints via `import typing as t`.

## Commands you will need

Run from `python/` with the venv active (`make env && source .venv/bin/activate` if not set up):

| Purpose | Command | Expected on success |
|---|---|---|
| Env setup | `make env` | exit 0 |
| Lint + types | `uv run nox -s chk` | exit 0 |
| Unit tests | `uv run nox -s tst` | all pass |
| Targeted tests | `uv run pytest tests/ -k telemetry -v` | new tests pass |

## Scope

**In scope**:
- `python/composio/core/models/base.py`
- `python/composio/core/models/_telemetry.py`
- `python/composio/sdk.py` (only the `allow_tracking` wiring lines)
- `python/composio/client/__init__.py` (or wherever `HttpClient.__init__` lives — only to accept/store the flag)
- New/updated tests under `python/tests/`

**Out of scope**:
- The TypeScript SDK (plan 005 handles the TS mirror; keep the redaction policy identical — see Step 2).
- The public `Composio(...)` constructor signature — `allow_tracking` keeps its name, position (kwarg), and default (`True`).
- Removing telemetry or changing metric (non-error) payloads.
- The `composio_client` generated package.

## Git workflow

- Branch from `next`: `advisor/003-python-telemetry`
- Conventional commit, e.g. `fix(python): honor allow_tracking across threads and redact error telemetry`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `allow_tracking` per-instance instead of a module-global ContextVar

1. In `HttpClient.__init__` (find it: `grep -n "class HttpClient" python/composio/client/__init__.py` or `python/composio/client/*.py`), accept and store `allow_tracking: bool = True` as `self.allow_tracking`.
2. In `python/composio/sdk.py:143-150`, delete the `allow_tracking.set(...)` line and instead pass `allow_tracking=kwargs.get("allow_tracking", True)` into the `HttpClient(...)` constructor call.
3. In `python/composio/core/models/base.py`, change the wrapper gate to read the instance flag, keeping the ContextVar as a secondary escape hatch for anyone who set it directly:
   ```python
   def trace_wrapper(self, *args: t.Any, **kwargs: t.Any) -> t.Any:
       client_allows = getattr(getattr(self, "_client", None), "allow_tracking", True)
       if not client_allows or not allow_tracking.get():
           return method(self, *args, **kwargs)
   ```
   Keep the module-level `allow_tracking` ContextVar defined and exported exactly as before (it is imported by `sdk.py` today; after step 2 remove that now-unused import from `sdk.py`, but leave the symbol in `base.py`).

**Verify**: `uv run nox -s chk` → exit 0. `grep -n "allow_tracking.set" python/composio/sdk.py` → no matches.

### Step 2: Redact the error telemetry payload

In `base.py`, replace the error payload construction so nothing user-derived leaves the process:

```python
except Exception as e:
    _, payload = event
    payload["error"] = {
        "name": e.__class__.__name__,
        "code": getattr(e, "code", None),
    }
    event = ("error", payload)
    raise e
```

Delete the now-unused `import traceback` if nothing else in the file uses it. Do NOT include `str(e)` or any traceback content. (Policy note for the reviewer: error *class name* + *code* preserves aggregate monitoring; message/stack are where arguments and paths leak. Plan 005 applies the identical policy to TypeScript so the two SDKs stay at parity — this is required by the repo's cross-SDK parity policy, `docs/decisions/cross-sdk-parity-policy.md`.)

**Verify**: `grep -n "format_exc\|traceback" python/composio/core/models/base.py` → no matches. `uv run nox -s chk` → exit 0.

### Step 3: Lock the telemetry thread initialization

In `python/composio/core/models/_telemetry.py`, add a module-level lock and wrap `_setup`'s body:

```python
_setup_lock = tr.Lock()

def _setup():
    global _queue, _event, _thread
    with _setup_lock:
        if _queue is None:
            _queue = q.Queue[Event]()
        if _event is None:
            _event = tr.Event()
        if _thread is None:
            ...  # existing thread start + atexit.register, unchanged
    return _queue, _event, _thread
```

(`tr` is the module's existing `threading` alias — confirm at the top of the file.)

**Verify**: `uv run nox -s chk` → exit 0.

### Step 4: Tests

First check for existing telemetry tests: `grep -rln "telemetry\|allow_tracking" python/tests/`. Extend the existing file if one exists; otherwise create `python/tests/test_telemetry.py` modeled structurally on a neighboring unit test file (pick any small one in `python/tests/`, e.g. the one covering `base` or `sdk` construction). Cases (mock `push_event`/network — never hit the real endpoint):

1. `allow_tracking=False` suppresses events from a `ThreadPoolExecutor` worker thread (this is the regression this plan fixes — it fails on the old code).
2. `allow_tracking=True` (default) still emits.
3. Error events contain only `name` and `code` keys — assert `"message" not in payload["error"]` and `"stack" not in payload["error"]`.
4. Two threads calling `push_event` concurrently on a fresh module state result in exactly one worker thread (reload `_telemetry` module state in the test, call `_setup` from N threads via a barrier, assert one `_thread`).

**Verify**: `uv run pytest tests/ -k "telemetry" -v` → all new tests pass; `uv run nox -s tst` → full suite passes.

## Test plan

Covered in Step 4. The thread-propagation test is the load-bearing one: it must fail against the unpatched code (verify once by stashing your base.py change if cheap to do) and pass after.

## Done criteria

- [ ] `uv run nox -s chk` exits 0 (ruff + mypy clean).
- [ ] `uv run nox -s tst` exits 0, including ≥4 new telemetry tests.
- [ ] `grep -rn "format_exc" python/composio/core/models/base.py` → empty.
- [ ] `grep -n "allow_tracking.set" python/composio/sdk.py` → empty.
- [ ] `Composio(allow_tracking=...)` signature unchanged (`grep -n "allow_tracking" python/composio/sdk.py` shows it still read from kwargs).
- [ ] `git status` shows only in-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `HttpClient` turns out not to be repo-owned (i.e. it is imported from the external `composio_client` package rather than defined under `python/composio/client/`) — the per-instance flag then needs a different carrier; report back.
- Any existing test asserts on error-telemetry `message`/`stack` contents in a way that suggests a downstream consumer contract — report before changing the payload shape.
- `python/tests` has a conftest that globally disables telemetry in a way that makes the thread test vacuous and you cannot isolate it — report rather than shipping a test that can't fail.

## Maintenance notes

- Plan 005 applies the same redaction policy to `ts/packages/core/src/telemetry/Telemetry.ts`. If the maintainer later wants verbose error telemetry back, add an explicit opt-in env (e.g. `COMPOSIO_TELEMETRY_VERBOSE_ERRORS=true`) on BOTH SDKs in the same release — never default-on.
- The v1 error-catalog work (docs/plans/2026-07-03-004) will add stable `COMPOSIO::` codes; once landed, `getattr(e, "code", None)` starts carrying real values — no change needed here.
- Reviewer scrutiny: that the ContextVar fallback doesn't accidentally invert the gate (both the instance flag AND the contextvar must allow tracking for it to emit).
