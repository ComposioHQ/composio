"""Exercise item schemas through the real optional Google ADK provider."""

import socket

import pytest

from composio.client.types import Tool

google_adk = pytest.importorskip("composio_google_adk")


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("combiner", ["anyOf", "oneOf"])
# Exceed the converter budget without hitting unrelated schema-copy limits.
@pytest.mark.parametrize("depth", [0, 96], ids=["nullable", "depth-limit"])
def test_array_items_reach_the_adk_declaration(combiner, depth, monkeypatch):
    def reject_network(*args, **kwargs):
        pytest.fail("Tool declaration generation must not use the network")

    monkeypatch.setattr(socket.socket, "connect", reject_network)
    monkeypatch.setattr(socket, "getaddrinfo", reject_network)
    items = {combiner: [{"type": "string"}, {"type": "null"}]}
    for _ in range(depth):
        items = {combiner: [items]}
    tool = Tool.model_construct(
        slug="offline_schema_probe",
        description="Offline schema probe",
        input_parameters={
            "type": "object",
            "properties": {
                "values": {
                    "type": "array",
                    "items": items,
                }
            },
            "required": ["values"],
        },
    )

    def execute_tool(**kwargs):
        pytest.fail("Generating a tool declaration must not execute the tool")

    wrapped = google_adk.GoogleAdkProvider().wrap_tool(tool, execute_tool=execute_tool)
    declaration = wrapped._get_declaration()
    expected_items = {} if depth else {"anyOf": [{"type": "string"}, {"type": "null"}]}
    assert (
        declaration.parameters_json_schema["properties"]["values"]["items"]
        == expected_items
    )
