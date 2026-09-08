"""Drive to_strict_json_schema from the shared strict-mode corpus.

The corpus pins the exact output of the TypeScript implementation, so this
suite is the cross-SDK parity check for strict normalization.
"""

import copy

import pytest

from composio.utils.strict_schema import omit_null_tool_arguments, to_strict_json_schema
from tests.fixtures.json_schema_conversion_corpus import load_strict_cases


def assert_strict_shape(node, path=""):
    """Structural invariants OpenAI enforces on every node of a strict schema."""
    if isinstance(node, list):
        for index, item in enumerate(node):
            assert_strict_shape(item, f"{path}[{index}]")
        return
    if not isinstance(node, dict):
        return
    if "anyOf" in node:
        assert "type" not in node, f"{path}: type beside anyOf"
    for keyword in (
        "default",
        "examples",
        "oneOf",
        "patternProperties",
        "allOf",
        "prefixItems",
    ):
        assert keyword not in node, f"{path}: {keyword}"
    node_type = node.get("type")
    is_object = node_type == "object" or (
        isinstance(node_type, list) and "object" in node_type
    )
    if is_object or "properties" in node:
        properties = node.get("properties") or {}
        assert node.get("required") == list(properties.keys()), f"{path}: required"
        assert node.get("additionalProperties") is False, (
            f"{path}: additionalProperties"
        )
    for key, child in node.items():
        if key in ("enum", "const"):
            continue
        child_path = f"{path}.{key}" if path else key
        if key in ("properties", "$defs", "definitions") and isinstance(child, dict):
            # Keys of these maps are names, not keywords.
            for name, sub in child.items():
                assert_strict_shape(sub, f"{child_path}.{name}")
            continue
        assert_strict_shape(child, child_path)


@pytest.mark.parametrize("case", load_strict_cases(), ids=lambda case: case.id)
def test_strict_corpus_case(case):
    snapshot = copy.deepcopy(case.schema_)
    result = to_strict_json_schema(case.schema_)

    assert case.schema_ == snapshot, "input mutated"
    if case.strict.unsupported is not None:
        assert [(e.path, e.keyword) for e in result.unsupported] == [
            (e.path, e.keyword) for e in case.strict.unsupported
        ]
    else:
        assert result.unsupported == []
        assert result.schema == case.strict.schema_
        assert_strict_shape(result.schema)
        again = to_strict_json_schema(result.schema)
        assert again.schema == result.schema, "not idempotent"
        assert again.changes == []
    assert [(c.path, c.reason) for c in result.changes] == [
        (c.path, c.reason) for c in (case.changes or [])
    ]
    assert result.total_changes == len(result.changes)
    for arguments in case.arguments or []:
        assert (
            omit_null_tool_arguments(arguments.input, result.source) == arguments.output
        )
