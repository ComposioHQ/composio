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

# Require env vars
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
COMPOSIO_API_KEY = os.environ.get("COMPOSIO_API_KEY")

# Plugin test definitions
EXAMPLES = (
    {
        "file": PLUGINS / "autogen" / "autogen_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Task Complete"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
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
        env={**os.environ, **example["env"]},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for 2 minutes for example to run
    proc.wait(timeout=120)

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
