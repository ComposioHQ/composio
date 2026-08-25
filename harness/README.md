# Examples harness

Runs the entrypoints inventoried in `examples-manifest.json` against a live
Composio backend, records every backend call each entry makes, and compares two
runs call-for-call.

- `harness/run.mjs` — sweeps entries, writes `results.jsonl` + one trace file per
  entry under `.artifacts/examples-parity/<run-id>/`.
- `harness/parity.mjs` — compares two run directories.
- `harness/trace/register.mjs`, `harness/trace-py/sitecustomize.py` — the fetch
  and httpx tracers, injected by the runner. Examples never reference
  `COMPOSIO_TRACE_FILE` themselves.
- `scripts/examples-provision.mjs` — provisions the auth configs and connected
  accounts the tier-2/3 entries need, and prints them as `COMPOSIO_EXAMPLES_*`
  exports.

## Backend selection

`COMPOSIO_BASE_URL` picks the backend and defaults to staging. Any bare `https`
root is accepted; a URL carrying a path, query, fragment, or embedded
credentials is refused, because the tracers pin the backend host and the
provisioner appends its own paths. `.github/workflows/examples-live.yml` sets
staging explicitly, so CI is unaffected by the default.

Point this at a project whose data you are willing to have the examples touch.
`scripts/examples-provision.mjs --gc` deletes examples-owned resources older
than 24h across the whole project — never run it against a project you care
about. The outbound-email denylist is enforced in the tracers and is not
overridable per run; `--llm mock` additionally keeps model traffic on a local
`aimock` server so no agent can decide to write something.

## Comparing a client bump

A parity run is two sweeps over the same entry ids, one on each side of the
change, compared by traced `(method, path-template)` pairs.

```bash
# Provisioned ids for the project you are sweeping. Capture, then eval — a
# failed provisioning run must not be swallowed.
out=$(node scripts/examples-provision.mjs) && eval "$out"

# Baseline: the pinned client, from a checkout of the base branch.
node harness/run.mjs sweep --client baseline --lang py --llm mock --ids "$IDS"

# Candidate: the same entries with the candidate client swapped in.
COMPOSIO_CLIENT_WHEEL=/abs/path/composio_client-<version>-py3-none-any.whl \
  node harness/run.mjs sweep --client candidate --lang py --llm mock --ids "$IDS"

node harness/parity.mjs <baseline-run-dir> <candidate-run-dir>
```

Pass `--ids` explicitly rather than relying on the default selection, so both
sides run the same set even when the two checkouts disagree about the manifest.

The candidate client comes from a **local artifact**, not a version spec:
`COMPOSIO_CLIENT_TARBALL` for TypeScript, `COMPOSIO_CLIENT_WHEEL` for Python.
Fetch the Python one with `pip download composio-client==<version> --no-deps`.
Both swaps abort the sweep if the client the project resolves does not actually
change, and both restore the files they touched when the sweep ends.

For Python the runner also drops the project's exact `composio-client==` pin for
the duration of a candidate sweep. Several entries install the local `./python`
project through `pyWith`, and uv cannot satisfy that pin and the candidate wheel
at once — without this, those entries fail to resolve and go red for a packaging
reason, quietly shrinking the comparison.

`parity.mjs` only compares entries green in **both** runs; anything red, skipped,
or missing on either side becomes `parity: false` with a reason rather than
failing the comparator. Read `compared` alongside `parityGreen`, and check that
the traces are non-empty — parity over two empty traces holds vacuously.

## Verifying the harness itself

```bash
node harness/run.mjs selftest
```

Covers backend-URL handling, the candidate-swap guards, the known-good and
known-bad fixtures, both tracers, and the comparator's own accept/reject
behaviour. `node harness/run.mjs neg` is the complementary check on the examples:
every entry must go red under garbage credentials, so an entry that swallows its
errors cannot pass as coverage.
