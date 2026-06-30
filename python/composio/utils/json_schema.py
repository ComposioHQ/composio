"""Inline internal JSON Schema ``$ref`` pointers.

Python counterpart of the TypeScript SDK's ``dereferenceJsonSchema``
(``ts/packages/core/src/utils/jsonSchema.ts``). Hand-rolled schema walkers in
the SDK (e.g. the file-upload/download substitution in
:mod:`composio.core.models._files`) recurse through ``properties``/``anyOf``/
``oneOf``/``allOf``/``items`` but do not dereference ``$ref``. The Composio API
emits tool parameter schemas with ``$ref``/``$defs`` indirection (``GMAIL_GET_
ATTACHMENT`` is the canonical shape), so a ``file_uploadable``/``file_
downloadable`` flag reachable only through a reference is silently missed.

Resolving references *once* at the boundary — rather than teaching every walker
to dereference — keeps the walkers reference-agnostic and gives all of them
``$ref`` support for free, including keywords they never special-cased
(``additionalProperties``, ``patternProperties``, ``prefixItems``, ``not``, …),
because :func:`dereference_json_schema` walks containers reflectively.
"""

from __future__ import annotations

import typing as t

from composio.exceptions import JSONSchemaRefResolutionError
from composio.utils.logging import get as get_logger

logger = get_logger()

# A ``$ref`` chain longer than this, or object nesting deeper than this, is
# treated as pathological (cyclic data, a billion-laughs-style schema) and
# raises rather than exhausting the interpreter's recursion limit. The caps
# fire in both strict and lenient modes — leniency applies to *unresolvable*
# refs, not to runaway expansion.
MAX_REF_CHAIN_DEPTH = 100
MAX_NODE_DEPTH = 512

# In-band hint attached to the sentinel when lenient mode stands in for an
# unresolvable ``$ref``. Makes the degradation visible to an LLM reading the
# schema instead of leaving it a bare permissive object. Overridden by a
# caller-provided ``description`` sibling (Draft 2020-12 sibling-keyword merge).
UNRESOLVED_REF_DESCRIPTION = (
    "Schema shape unresolved at the source — validate loosely. "
    "See https://github.com/ComposioHQ/composio/issues/3307."
)

# Strategy when an internal ``$ref`` cannot be resolved.
# - ``"throw"`` (default): raise ``JSONSchemaRefResolutionError``. Right for
#   first-party / custom-tool schemas where a dangling ``$ref`` is a bug.
# - ``"sentinel"``: replace the node with a permissive object. Right for
#   schemas from an upstream service the caller cannot edit (the Composio API
#   ships some ``output_parameters`` with a ``$ref`` into ``#/$defs/...`` but no
#   ``$defs`` block — see https://github.com/ComposioHQ/composio/issues/3307).
UnresolvedRefStrategy = t.Literal["throw", "sentinel"]
UnresolvedRefReason = t.Literal["missing-target", "malformed-pointer"]

# Callback invoked once per replaced node in ``"sentinel"`` mode.
OnReplace = t.Callable[[str, "UnresolvedRefReason"], None]


def _cycle_break_sentinel() -> t.Dict[str, t.Any]:
    """A fresh permissive object used to break cycles / stand in for danglers."""
    return {"type": "object", "additionalProperties": True}


def _is_mapping(value: t.Any) -> bool:
    return isinstance(value, dict)


def _decode_pointer_segment(segment: str) -> str:
    # Order matters: ``~01`` must decode to ``~1`` (literal), not ``/``.
    return segment.replace("~1", "/").replace("~0", "~")


class _Resolution(t.NamedTuple):
    ok: bool
    value: t.Any = None
    reason: t.Optional[UnresolvedRefReason] = None
    failed_at: t.Optional[str] = None


def _try_resolve_pointer(root: t.Dict[str, t.Any], pointer: str) -> _Resolution:
    """Walk a local JSON Pointer (``#/a/b/0``) against ``root``.

    Returns a tagged result so the caller can distinguish a malformed pointer
    from a structurally valid pointer whose target is absent.
    """
    if pointer in ("#", ""):
        return _Resolution(ok=True, value=root)
    if not pointer.startswith("#/"):
        return _Resolution(ok=False, reason="malformed-pointer")

    cursor: t.Any = root
    for raw_segment in pointer[2:].split("/"):
        segment = _decode_pointer_segment(raw_segment)
        if isinstance(cursor, list):
            try:
                index = int(segment)
            except ValueError:
                return _Resolution(ok=False, reason="missing-target", failed_at=segment)
            if index < 0 or index >= len(cursor):
                return _Resolution(ok=False, reason="missing-target", failed_at=segment)
            cursor = cursor[index]
        elif isinstance(cursor, dict):
            if segment not in cursor:
                return _Resolution(ok=False, reason="missing-target", failed_at=segment)
            cursor = cursor[segment]
        else:
            return _Resolution(ok=False, reason="missing-target", failed_at=segment)
    return _Resolution(ok=True, value=cursor)


def _raise_resolution_error(pointer: str, resolution: _Resolution) -> t.NoReturn:
    if resolution.reason == "malformed-pointer":
        raise JSONSchemaRefResolutionError(
            f"Unsupported $ref pointer: {pointer}",
            meta={"ref": pointer},
        )
    meta: t.Dict[str, t.Any] = {"ref": pointer}
    if resolution.failed_at is not None:
        meta["failed_at"] = resolution.failed_at
    raise JSONSchemaRefResolutionError(
        f"Cannot resolve $ref {pointer}",
        meta=meta,
    )


def dereference_json_schema(
    schema: t.Any,
    *,
    on_unresolved: UnresolvedRefStrategy = "throw",
    on_replace: t.Optional[OnReplace] = None,
) -> t.Any:
    """Inline internal ``$ref`` pointers (``#/$defs/...`` and legacy
    ``#/definitions/...``), returning a new schema; the input is never mutated.

    External refs (``http://``, ``https://``, …) are left untouched (and logged
    once for audit, since a downstream resolver fetching them could enable SSRF
    or local-file disclosure). Cycles — both ``$ref`` cycles and JS-object-style
    identity cycles — are broken with a permissive ``{"type": "object",
    "additionalProperties": True}`` sentinel. ``$defs``/``definitions`` are
    stripped from the returned root once everything is inlined.

    :param on_unresolved: see :data:`UnresolvedRefStrategy`.
    :param on_replace: invoked once per replaced node in ``"sentinel"`` mode,
        with the original pointer and the reason it could not be resolved.
    :raises JSONSchemaRefResolutionError: on malformed pointers or missing
        targets (strict mode only), or chains/nesting past the safety caps
        (both modes).
    """
    if not _is_mapping(schema):
        return schema

    root = t.cast(t.Dict[str, t.Any], schema)
    # Identity-based cycle guard for the *current* walk path. Python doesn't
    # suffer JS-style prototype pollution, so unlike the TS port there's no
    # need to filter ``__proto__``/``constructor`` keys while cloning.
    visiting: t.Set[int] = set()

    # ``walk`` uses explicit loops (not comprehensions) so each level of schema
    # nesting costs exactly one Python stack frame. That keeps ``MAX_NODE_DEPTH``
    # the binding limit under the interpreter's default recursion ceiling, so a
    # pathologically deep schema fails with our typed error rather than a bare
    # ``RecursionError`` (which is also caught at the call site as a backstop).
    def walk(
        node: t.Any,
        visited_refs: t.FrozenSet[str],
        chain_depth: int,
        node_depth: int,
    ) -> t.Any:
        if node_depth >= MAX_NODE_DEPTH:
            raise JSONSchemaRefResolutionError(
                f"JSON Schema node depth exceeded cap ({MAX_NODE_DEPTH})"
            )

        if isinstance(node, list):
            node_id = id(node)
            if node_id in visiting:
                return _cycle_break_sentinel()
            visiting.add(node_id)
            try:
                cloned_list: t.List[t.Any] = []
                for item in node:
                    cloned_list.append(
                        walk(item, visited_refs, chain_depth, node_depth + 1)
                    )
                return cloned_list
            finally:
                visiting.discard(node_id)

        if not _is_mapping(node):
            return node

        node_id = id(node)
        if node_id in visiting:
            return _cycle_break_sentinel()
        visiting.add(node_id)
        try:
            ref = node.get("$ref")
            ref = ref if isinstance(ref, str) else None

            # External refs and non-``$ref`` nodes both pass through the same
            # reflective clone path.
            if ref is None or not ref.startswith("#"):
                if ref is not None:
                    logger.warning("Leaving external $ref untouched: %s", ref)
                cloned: t.Dict[str, t.Any] = {}
                for key, value in node.items():
                    cloned[key] = walk(value, visited_refs, chain_depth, node_depth + 1)
                return cloned

            if chain_depth >= MAX_REF_CHAIN_DEPTH:
                raise JSONSchemaRefResolutionError(
                    f"JSON Schema $ref chain exceeded depth cap "
                    f"({MAX_REF_CHAIN_DEPTH}): {ref}",
                    meta={"ref": ref},
                )
            if ref in visited_refs:
                return _cycle_break_sentinel()

            resolution = _try_resolve_pointer(root, ref)
            if resolution.ok:
                target: t.Any = resolution.value
            elif on_unresolved == "sentinel":
                if on_replace is not None and resolution.reason is not None:
                    on_replace(ref, resolution.reason)
                target = {
                    **_cycle_break_sentinel(),
                    "description": UNRESOLVED_REF_DESCRIPTION,
                }
            else:
                _raise_resolution_error(ref, resolution)

            next_refs = visited_refs | {ref}
            resolved = walk(target, next_refs, chain_depth + 1, node_depth + 1)

            # Shallow-merge sibling keywords next to ``$ref`` (Draft 2020-12:
            # siblings win on collision). Draft 7 ignores them, but the Composio
            # tool surface admits both, so we honor siblings for safety.
            siblings = {key: value for key, value in node.items() if key != "$ref"}
            if not siblings or not _is_mapping(resolved):
                return resolved
            merged = dict(resolved)
            for key, value in siblings.items():
                merged[key] = walk(value, visited_refs, chain_depth, node_depth + 1)
            return merged
        finally:
            visiting.discard(node_id)

    try:
        out = walk(root, frozenset(), 0, 0)
    except RecursionError as exc:  # pragma: no cover - depth cap normally fires first
        raise JSONSchemaRefResolutionError(
            "JSON Schema nesting too deep to dereference"
        ) from exc
    if _is_mapping(out):
        out.pop("$defs", None)
        out.pop("definitions", None)
    return out
