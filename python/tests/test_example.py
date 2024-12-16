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
JULEP_API_KEY = os.environ.get("JULEP_API_KEY")
JULEP_API_URL = os.environ.get("JULEP_API_URL")
LISTENNOTES_API_KEY = os.environ.get("LISTENNOTES_API_KEY")

# Plugin test definitions
EXAMPLES = {
    "autogen": {
        "plugin": "autogen",
        "file": PLUGINS / "autogen" / "autogen_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    "llamaindex": {
        "plugin": "llamaindex",
        "file": PLUGINS / "llamaindex" / "llamaindex_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    "local_tools": {
        "plugin": "autogen",
        "file": EXAMPLES_PATH / "miscellaneous" / "math_agent" / "autogen_math.py",
        "match": {
            "type": "stdout",
            "values": ["11962"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY},
    },
    "runtime_tools": {
        "plugin": "langchain",
        "file": EXAMPLES_PATH / "miscellaneous" / "runtime_tools" / "langchain_math.py",
        "match": {
            "type": "stdout",
            "values": ["2645406630"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY},
    },
    "crew_ai": {
        "plugin": "crew_ai",
        "file": PLUGINS / "crew_ai" / "crewai_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
        },
    },
    # TOFIX(@kaave): httpcore.UnsupportedProtocol: Request URL is missing an 'http://' or 'https://' protocol.
    # "julep": {
    #     "plugin": "julep",
    #     "file": PLUGINS / "julep" / "julep_demo.py",
    #     "match": {
    #         "type": "stdout",
    #         "values": ["finish_reason=<ChatResponseFinishReason.STOP: 'stop'>"],
    #     },
    #     "env": {
    #         "OPENAI_API_KEY": OPENAI_API_KEY,
    #         "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
    #         "JULEP_API_KEY": JULEP_API_KEY,
    #         "JULEP_API_URL": JULEP_API_URL,
    #     },
    # },
    "langchain": {
        "plugin": "langchain",
        "file": PLUGINS / "langchain" / "langchain_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "langgraph": {
        "plugin": "langgraph",
        "file": PLUGINS / "langgraph" / "langgraph_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "openai": {
        "plugin": "openai",
        "file": PLUGINS / "openai" / "openai_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "lyzr": {
        "plugin": "lyzr",
        "file": PLUGINS / "lyzr" / "lyzr_demo.py",
        "match": {
            "type": "stdout",
            "values": ["Action executed successfully"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "upload_file": {
        "plugin": "crew_ai",
        "file": EXAMPLES_PATH / "miscellaneous" / "attachment" / "send_attachment.py",
        "match": {
            "type": "stdout",
            "values": ["'labelIds': ['SENT']"],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    },
    "download_file": {
        "plugin": "crew_ai",
        "file": "run_issue.py",
        "match": {
            "type": "stdout",
            "values": ["composio_output/CODEINTERPRETER_GET_FILE_CMD_default_", ""],
        },
        "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
        "cwd": EXAMPLES_PATH
        / "quickstarters"
        / "sql_agent"
        / "sql_agent_plotter_crewai",
    },
    "multi_entity_api_key": {
        "plugin": "langchain",
        "file": EXAMPLES_PATH / "miscellaneous" / "multi_entity.py",
        "match": {
            "type": "stdout",
            "values": [
                "Invoking: `LISTENNOTES_FETCH_A_LIST_OF_SUPPORTED_LANGUAGES_FOR_PODCASTS`",
                "Any language",
                "Abkhazian",
                "Arabic",
            ],
        },
        "env": {
            "OPENAI_API_KEY": OPENAI_API_KEY,
            "COMPOSIO_API_KEY": COMPOSIO_API_KEY,
            "LISTENNOTES_API_KEY": LISTENNOTES_API_KEY,
        },
    },
    # "praisonai": {
    #     "plugin": "praisonai",
    #     "file": PLUGINS / "praisonai" / "praisonai_demo.py",
    #     "match": {
    #         "type": "stdout",
    #         "values": [
    #             "Action executed successfully"
    #         ],
    #     },
    #     "env": {"OPENAI_API_KEY": OPENAI_API_KEY, "COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    # },
    # TODO(@kaavee): Add Anthropic API key
    # "claude": {
    #     "plugin": "claude",
    #     "file": PLUGINS / "claude" / "claude_demo.py",
    #     "match": {
    #         "type": "stdout",
    #         "values": ["Action executed successfully"],
    #     },
    #     "env": {"COMPOSIO_API_KEY": COMPOSIO_API_KEY},
    # },
    # TODO: Add camel
}


@pytest.mark.skipif(
    condition=os.environ.get("CI", "false") == "true",
    reason="Testing in CI will lead to too much LLM API usage",
)
@pytest.mark.parametrize("example_name, example", EXAMPLES.items())
def test_example(
    example_name: str, example: dict  # pylint: disable=unused-argument
) -> None:
    """Test an example with given environment."""
    plugin_to_test = os.getenv("PLUGIN_TO_TEST")
    if plugin_to_test is not None and plugin_to_test != example["plugin"]:
        pytest.skip(f"Skipping {example['plugin']}")

    for key, val in example["env"].items():
        assert (
            val is not None
        ), f"Please provide value for `{key}` for testing `{example['file']}`"

    cwd = example.get("cwd", None)
    proc = subprocess.Popen(  # pylint: disable=consider-using-with
        args=[sys.executable, example["file"]],
        # TODO(@angryblade): Sanitize the env before running the process.
        env={**os.environ, **example["env"]},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
    )

    # Wait for 2 minutes for example to run
    proc.wait(timeout=180)

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
