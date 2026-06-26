"""Regression tests for SDK reference generation."""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path

import pytest

from composio.core.models.triggers import Triggers


def load_generate_docs_module():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "generate-docs.py"
    spec = importlib.util.spec_from_file_location("_generate_docs", script_path)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_triggers_parse_generated_example_is_valid_python():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(Triggers.parse.__doc__)
    assert parsed["examples"], "Triggers.parse() must keep its public example"

    try:
        ast.parse(parsed["examples"][0])
    except SyntaxError as exc:
        pytest.fail(
            "Triggers.parse() generated SDK reference example must be "
            f"copy-pasteable Python: {exc}"
        )


def test_generated_examples_do_not_keep_nested_markdown_fences():
    generate_docs = load_generate_docs_module()

    parsed = generate_docs.parse_docstring(
        """
        Fetch SDK data.

        Example:
            ```python
            result = composio.tools.get_raw_tool_router_meta_tools("session_123")
            print(result)
            ```
        """
    )

    assert parsed["examples"] == [
        'result = composio.tools.get_raw_tool_router_meta_tools("session_123")\n'
        "print(result)"
    ]
