"""
E2E Tests for plugin demos and examples.
"""

import os
import subprocess
import sys
import typing as t
from pathlib import Path

import pytest


PLUGINS = Path.cwd() / "plugins"
EXAMPLES_PATH = Path.cwd() / "examples"

# Require env vars
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
COMPOSIO_API_KEY = os.environ.get("COMPOSIO_API_KEY")

# Plugin test definitions
EXAMPLES = (
    {
        "file": PLUGINS / "autogen" / "autogen_demo.py",
        "match": {
            "type": "stdout",
            "values": [
                '{"execution_details": {"executed": true}, "response_data": ""}'
            ],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    {
        "file": PLUGINS / "llamaindex" / "llamaindex_demo.py",
        "match": {
            "type": "stdout",
            "values": [
                "{'execution_details': {'executed': True}, 'response_data': ''}",
            ],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    {
        "file": EXAMPLES_PATH / "local_tools" / "autogen_math.py",
        "match": {
            "type": "stdout",
            "values": [
                '{"execution_details": {"executed": true}, "response_data": 11962.560439560439}'
            ],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY},
    },
)


@pytest.mark.skipif(
    condition=os.environ.get("CI") is not None,
    reason="Testing in CI will lead to too much LLM API usage",
)
@pytest.mark.parametrize("example", EXAMPLES)
def test_example(example: dict) -> None:
    """Test an example with given environment."""
    for key, val in example["env"].items():
        assert (
            val is not None
        ), f"Please provide value for `{key}` for testing `{example['file']}`"

    proc = subprocess.Popen(  # pylint: disable=consider-using-with
        args=[sys.executable, example["file"]],
        # TODO(@angryblade): Sanitize the env before running the process.
        env={**os.environ, **example["env"]},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for 2 minutes for example to run
    proc.wait(timeout=120)

    # Check if process exited with success
    assert proc.returncode == 0, (
        t.cast(t.IO[bytes], proc.stderr).read().decode(encoding="utf-8")
    )

    # Validate output
    output = (
        t.cast(
            t.IO[bytes],
            (proc.stdout if example["match"]["type"] == "stdout" else proc.stderr),
        )
        .read()
        .decode(encoding="utf-8")
    )
    for match in example["match"]["values"]:
        assert match in output
