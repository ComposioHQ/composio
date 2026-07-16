"""A lazy data pipe spanning every datastore — read from any, publish to any.

Chain transforms over a source and either ``.collect()`` the rows or ``.publish()`` them
to a sink. Nothing runs until then; the chain is a JSON *spec* (plain data, never code),
so a fixed interpreter (:mod:`app.jobs.pipe_exec`) runs it and it is safe to build from
untrusted input (``Pipe.from_spec``).

Everything runs in-process on the host (the small interpreter over already-buffered data);
the workbench is reserved for code the agent writes itself. Sources:
  * ``"<stream>"`` / ``"mount:<stream>"`` — a normalized event stream from the volume.
  * ``"durable:summaries"`` / ``"durable:artifacts"`` — the durable SQLite store.
  * ``"local:<relpath>"`` — a JSON/JSONL file under the local datastore.

Publish — ``.publish(key, durable=…, local=…)`` writes the result via :mod:`app.store`
(durable row and/or local export file). Host-mediated, same as the agent's save path.

    from app.pipe import source

    # read the 6-month durable archive, host-side
    source("durable:summaries").groupby("leader").count("days").collect()

    # read mount events in the sandbox, publish a rollup to durable + a local file
    (source("subscription_events").where(type="subscription_started")
        .groupby("source").agg(mrr=("mrr_cents", "sum"))
        .publish("mrr_by_source", volume=vol, durable=True, local=True))
"""
from __future__ import annotations

import json
from typing import Any

from app import durable, schema, store
from app.config import settings
from app.jobs import pipe_exec

# Aggregation functions the interpreter accepts. "size" counts rows (col is ignored).
_AGG_FUNCS = {"sum", "count", "mean", "min", "max", "nunique",
              "first", "last", "size", "median", "std"}


class PipeError(RuntimeError):
    pass


_UNSET = object()


class Pipe:
    """An immutable, lazy chain of transforms over one source."""

    def __init__(self, source: str, ops: list[dict] | None = None,
                 by: list[str] | None = None):
        self.source = source
        self._ops = list(ops or [])
        self._by = list(by) if by is not None else None  # pending groupby keys

    # --- builders (each returns a new Pipe) ---
    def _with(self, *, ops: list[dict] | None = None, by: Any = _UNSET) -> "Pipe":
        return Pipe(self.source,
                    self._ops if ops is None else ops,
                    self._by if by is _UNSET else by)

    def _step(self, op: dict) -> "Pipe":
        return self._with(ops=self._ops + [op])

    def where(self, **eq: Any) -> "Pipe":
        """Keep rows whose columns equal the given values (string-compared)."""
        return self._step({"op": "where", "eq": dict(eq)})

    def select(self, *cols: str) -> "Pipe":
        """Project to a subset of columns."""
        return self._step({"op": "select", "cols": list(cols)})

    def groupby(self, *cols: str) -> "Pipe":
        """Set grouping keys; consumed by the next ``agg``/``count``."""
        return self._with(by=list(cols))

    def agg(self, **named: tuple[str, str]) -> "Pipe":
        """Aggregate, optionally per current groupby. ``name=(column, func)``."""
        spec: dict[str, list[str]] = {}
        for name, val in named.items():
            col, func = val
            if func not in _AGG_FUNCS:
                raise PipeError(f"unsupported agg func {func!r}; allowed: {sorted(_AGG_FUNCS)}")
            spec[name] = [col, func]
        return self._with(ops=self._ops + [{"op": "agg", "by": self._by or [], "agg": spec}],
                          by=None)

    def count(self, name: str = "count") -> "Pipe":
        """Count rows (per group if a ``groupby`` is pending)."""
        return self.agg(**{name: ("*", "size")})

    def sort(self, *cols: str, desc: bool = False) -> "Pipe":
        return self._step({"op": "sort", "cols": list(cols), "desc": bool(desc)})

    def head(self, n: int) -> "Pipe":
        return self._step({"op": "head", "n": int(n)})

    # --- terminals ---
    def to_spec(self) -> dict:
        return {"source": self.source, "ops": self._ops}

    @classmethod
    def from_spec(cls, spec: dict) -> "Pipe":
        """Rebuild a pipe from a serialised spec (e.g. received over an API)."""
        return cls(spec["source"], spec.get("ops", []))

    def validate(self) -> None:
        """Raise PipeError (with a precise message) if the spec is malformed. Runs at the
        boundary so the interpreter only ever sees well-formed specs — and so untrusted
        specs (``from_spec``) get a clean error instead of a deep traceback."""
        if not isinstance(self.source, str) or not self.source:
            raise PipeError("source must be a non-empty string")
        kind, name = self._route()  # raises on unknown backend
        if kind == "mount" and name not in schema.STREAMS:
            raise PipeError(f"unknown stream {name!r}; known: {sorted(schema.STREAMS)}")
        if kind == "durable" and name not in ("summaries", "artifacts"):
            raise PipeError(f"unknown durable source {name!r} (summaries|artifacts)")
        if kind == "local" and not name:
            raise PipeError("local source needs a path")
        if not isinstance(self._ops, list):
            raise PipeError("ops must be a list")
        for i, op in enumerate(self._ops):
            _validate_op(i, op)

    def collect(self, volume=None) -> list[dict]:
        """Execute the pipeline and return the result rows."""
        self.validate()
        kind, name = self._route()
        if kind == "mount":
            return self._collect_mount(name, volume)
        return pipe_exec.run(_load_host_rows(kind, name), self._ops)

    def first(self, volume=None) -> dict | None:
        rows = self.collect(volume)
        return rows[0] if rows else None

    def publish(self, key: str, *, volume=None, durable: bool = True,
                local: bool = False, filename: str | None = None) -> dict:
        """Run the pipeline and persist its rows to durable and/or local storage."""
        rows = self.collect(volume)
        return store.save(key, rows, durable_store=durable, local=local, filename=filename)

    # --- routing / execution ---
    def _route(self) -> tuple[str, str]:
        src = self.source
        if ":" in src:
            kind, name = src.split(":", 1)
            if kind not in ("mount", "durable", "local"):
                raise PipeError(f"unknown source backend {kind!r} (mount|durable|local)")
            return kind, name
        return "mount", src

    def _collect_mount(self, name: str, volume) -> list[dict]:
        if volume is None:
            raise PipeError("a volume is required for a mount source")
        fname = name if name.endswith(".jsonl") else name + ".jsonl"
        rows = volume.read_jsonl(f"normalized/{fname}")
        return pipe_exec.run(rows, self._ops)


def source(name: str) -> Pipe:
    """Start a pipeline. See module docstring for the source forms."""
    return Pipe(name)


def _validate_op(i: int, op: Any) -> None:
    if not isinstance(op, dict) or "op" not in op:
        raise PipeError(f"op[{i}] must be an object with an 'op' field")
    kind = op["op"]
    if kind == "where":
        if not isinstance(op.get("eq"), dict) or not op["eq"]:
            raise PipeError(f"op[{i}] 'where' needs a non-empty 'eq' object")
    elif kind == "select":
        if not isinstance(op.get("cols"), list) or not op["cols"]:
            raise PipeError(f"op[{i}] 'select' needs a non-empty 'cols' list")
    elif kind == "agg":
        if not isinstance(op.get("by"), list):
            raise PipeError(f"op[{i}] 'agg' needs a 'by' list (possibly empty)")
        agg = op.get("agg")
        if not isinstance(agg, dict) or not agg:
            raise PipeError(f"op[{i}] 'agg' needs a non-empty 'agg' map")
        for out, val in agg.items():
            if not (isinstance(val, (list, tuple)) and len(val) == 2):
                raise PipeError(f"op[{i}] agg '{out}' must be [column, func]")
            if val[1] not in _AGG_FUNCS:
                raise PipeError(f"op[{i}] agg func {val[1]!r} not allowed; use {sorted(_AGG_FUNCS)}")
    elif kind == "sort":
        if not isinstance(op.get("cols"), list) or not op["cols"]:
            raise PipeError(f"op[{i}] 'sort' needs a non-empty 'cols' list")
    elif kind == "head":
        n = op.get("n")
        if not isinstance(n, int) or isinstance(n, bool) or n < 0:
            raise PipeError(f"op[{i}] 'head' needs a non-negative integer 'n'")
    else:
        raise PipeError(f"op[{i}] unknown op {kind!r}")


def _load_host_rows(kind: str, name: str) -> list[dict]:
    if kind == "durable":
        if name == "summaries":
            return durable.load_summaries()
        if name == "artifacts":
            return durable.list_artifacts()
        raise PipeError(f"unknown durable source {name!r} (summaries|artifacts)")
    if kind == "local":
        return _read_local(name)
    raise PipeError(f"cannot load host rows for backend {kind!r}")


def _read_local(rel: str) -> list[dict]:
    """Read a JSON (list or object) / JSONL file under the local datastore."""
    base = settings.data_root.resolve()
    path = (base / rel).resolve()
    if not str(path).startswith(str(base)):
        raise PipeError("local source path escapes the datastore")
    if not path.exists():
        return []
    if path.suffix == ".jsonl":
        return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else [data]
