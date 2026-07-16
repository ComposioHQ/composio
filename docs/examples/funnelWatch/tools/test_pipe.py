#!/usr/bin/env python3
"""Demonstrate app.pipe working correctly across every backend and guard.

Self-contained: forces local mode and redirects all datastores (volume, durable SQLite,
local exports) into a throwaway temp dir, so it never touches real data and needs no
running server. Exercises mount/durable/local reads, publish, spec round-trip,
structural validation, and empty-data handling.

Usage:
  uv run python tools/test_pipe.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

# Force the offline path and isolate every datastore BEFORE app modules cache paths.
os.environ["GROWTH_PULSE_FORCE_LOCAL"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, for `app`
_TMP = Path(tempfile.mkdtemp(prefix="pipe-test-"))

from app.config import settings  # noqa: E402

object.__setattr__(settings, "data_root", _TMP)
object.__setattr__(settings, "durable_db", _TMP / "summaries.db")

from app import durable, store  # noqa: E402
from app.pipe import Pipe, PipeError, source  # noqa: E402
from app.volume import LocalVolume  # noqa: E402

store.EXPORT_DIR = _TMP / "exports"  # module-level constant, repoint for isolation

_passed = 0
_failed = 0


def _norm(x):
    """Order-independent comparison key for a list of row dicts."""
    if isinstance(x, list):
        return sorted(json.dumps(r, sort_keys=True) for r in x)
    return x


def check(name: str, got, expected) -> None:
    global _passed, _failed
    if _norm(got) == _norm(expected):
        _passed += 1
        print(f"  ✓ {name}")
    else:
        _failed += 1
        print(f"  ✗ {name}\n      got:      {got}\n      expected: {expected}")


def expect_error(name: str, fn) -> None:
    global _passed, _failed
    try:
        fn()
    except PipeError as exc:
        _passed += 1
        print(f"  ✓ {name}  -> PipeError: {exc}")
    except Exception as exc:  # noqa: BLE001
        _failed += 1
        print(f"  ✗ {name}  -> {type(exc).__name__} (expected PipeError): {exc}")
    else:
        _failed += 1
        print(f"  ✗ {name}  -> no error raised (expected PipeError)")


def main() -> int:
    vol = LocalVolume(_TMP / "ws")

    # --- seed a mount event stream ---
    for row in [
        {"type": "subscription_started", "mrr_cents": 4900, "source": "google"},
        {"type": "subscription_started", "mrr_cents": 2900, "source": "google"},
        {"type": "subscription_started", "mrr_cents": 1900, "source": "meta"},
        {"type": "trial_started", "mrr_cents": 0, "source": "google"},
    ]:
        vol.append_jsonl("normalized/subscription_events.jsonl", row)

    # --- seed the durable archive ---
    durable.save_daily_summary("2026-06-20", {"session_date": "2026-06-20", "new_mrr": 100, "leader": "Pro"})
    durable.save_daily_summary("2026-06-21", {"session_date": "2026-06-21", "new_mrr": 200, "leader": "Pro"})
    durable.save_daily_summary("2026-06-22", {"session_date": "2026-06-22", "new_mrr": 150, "leader": "Starter"})

    # --- seed a local datastore file ---
    store.save("roas", [{"campaign": "brand", "roas": 1.4}, {"campaign": "retarget", "roas": 0.8}],
               durable_store=False, local=True, filename="roas.json")

    print("MOUNT source (runs over event data):")
    check("where + groupby + agg + sort(desc)",
          source("subscription_events").where(type="subscription_started")
          .groupby("source").agg(mrr=("mrr_cents", "sum")).sort("mrr", desc=True).collect(vol),
          [{"source": "google", "mrr": 7800}, {"source": "meta", "mrr": 1900}])
    check("count rows per group",
          source("subscription_events").where(type="subscription_started")
          .groupby("source").count("n").collect(vol),
          [{"source": "google", "n": 2}, {"source": "meta", "n": 1}])
    check("head limits rows",
          source("subscription_events").select("source", "mrr_cents").head(1).collect(vol),
          [{"source": "google", "mrr_cents": 4900}])

    print("DURABLE source (queries the archive, host-side):")
    check("select columns",
          source("durable:summaries").select("session_date", "new_mrr").collect(vol),
          [{"session_date": "2026-06-22", "new_mrr": 150},
           {"session_date": "2026-06-21", "new_mrr": 200},
           {"session_date": "2026-06-20", "new_mrr": 100}])
    check("groupby + sum across days",
          source("durable:summaries").groupby("leader").agg(total=("new_mrr", "sum")).collect(vol),
          [{"leader": "Pro", "total": 300}, {"leader": "Starter", "total": 150}])

    print("LOCAL source (reads a datastore file):")
    check("read + filter local json",
          source("local:exports/roas.json").where(campaign="brand").collect(vol),
          [{"campaign": "brand", "roas": 1.4}])
    expect_error("path traversal is blocked",
                 lambda: source("local:../../etc/passwd").collect(vol))

    print("PUBLISH (read mount -> write durable + local):")
    manifest = (source("subscription_events").where(type="subscription_started")
                .groupby("source").agg(mrr=("mrr_cents", "sum"))
                .publish("mrr_by_source", volume=vol, durable=True, local=True))
    check("publish manifest names both targets",
          sorted(manifest), ["durable", "local"])
    check("durable read-back matches",
          durable.load_artifact("mrr_by_source"),
          [{"source": "google", "mrr": 7800}, {"source": "meta", "mrr": 1900}])
    check("local export file written", Path(manifest["local"]).exists(), True)

    print("SPEC round-trip (safe to accept over an API):")
    spec = source("durable:summaries").groupby("leader").count("days").to_spec()
    check("from_spec(to_spec) == direct",
          Pipe.from_spec(spec).collect(vol),
          source("durable:summaries").groupby("leader").count("days").collect(vol))

    print("VALIDATION (malformed specs raise PipeError, not deep tracebacks):")
    expect_error("unknown stream", lambda: Pipe.from_spec({"source": "made_up", "ops": []}).collect(vol))
    expect_error("unknown backend", lambda: Pipe.from_spec({"source": "foo:bar", "ops": []}).collect(vol))
    expect_error("unknown durable source", lambda: Pipe.from_spec({"source": "durable:nope", "ops": []}).collect(vol))
    expect_error("op not an object", lambda: Pipe.from_spec({"source": "durable:summaries", "ops": ["x"]}).collect(vol))
    expect_error("unknown op", lambda: Pipe.from_spec({"source": "durable:summaries", "ops": [{"op": "frob"}]}).collect(vol))
    expect_error("where missing eq", lambda: Pipe.from_spec({"source": "durable:summaries", "ops": [{"op": "where"}]}).collect(vol))
    expect_error("agg bad func", lambda: Pipe.from_spec(
        {"source": "durable:summaries", "ops": [{"op": "agg", "by": ["leader"], "agg": {"x": ["new_mrr", "nope"]}}]}).collect(vol))
    expect_error("head non-integer n", lambda: Pipe.from_spec(
        {"source": "durable:summaries", "ops": [{"op": "head", "n": "ten"}]}).collect(vol))

    print("EDGE cases:")
    check("empty stream -> []", source("ad_events").collect(vol), [])
    check("filter matching nothing -> []",
          source("subscription_events").where(source="nonexistent").collect(vol), [])

    print(f"\n{_passed} passed, {_failed} failed")
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
