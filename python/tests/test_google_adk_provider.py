"""Exercise item schemas through the real optional Google ADK provider."""

import socket

import pytest

from composio.client.types import Tool

google_adk = pytest.importorskip("composio_google_adk")


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("combiner", ["anyOf", "oneOf"])
def test_nullable_array_items_reach_the_adk_declaration(combiner, monkeypatch):
    def reject_network(*args, **kwargs):
        pytest.fail("Tool declaration generation must not use the network")

    monkeypatch.setattr(socket.socket, "connect", reject_network)
    monkeypatch.setattr(socket, "getaddrinfo", reject_network)
    tool = Tool.model_construct(
        slug="offline_schema_probe",
        description="Offline schema probe",
        input_parameters={
            "type": "object",
            "properties": {
                "values": {
                    "type": "array",
                    "items": {combiner: [{"type": "string"}, {"type": "null"}]},
                }
            },
            "required": ["values"],
        },
    )

    def execute_tool(**kwargs):
        pytest.fail("Generating a tool declaration must not execute the tool")

    wrapped = google_adk.GoogleAdkProvider().wrap_tool(tool, execute_tool=execute_tool)
    declaration = wrapped._get_declaration()
    assert declaration.parameters_json_schema["properties"]["values"]["items"] == {
        "anyOf": [{"type": "string"}, {"type": "null"}]
    }
