from unittest.mock import Mock

from composio.core.models._files import FileHelper


def test_substitute_file_uploads_does_not_keyerror_when_schema_type_missing(tmp_path):
    helper = FileHelper(client=Mock(), outdir=str(tmp_path))

    tool = Mock()
    tool.slug = "tool"
    tool.toolkit = Mock()
    tool.toolkit.slug = "toolkit"
    tool.input_parameters = {
        "type": "object",
        "properties": {
            "nested": {
                "oneOf": [
                    {"type": "object", "properties": {"x": {"type": "string"}}},
                    {"type": "string"},
                ]
            }
        },
    }

    req = {"nested": {}}
    assert helper.substitute_file_uploads(tool=tool, request=req) == req


def test_substitute_file_downloads_does_not_keyerror_when_schema_type_missing(tmp_path):
    helper = FileHelper(client=Mock(), outdir=str(tmp_path))

    tool = Mock()
    tool.slug = "tool"
    tool.toolkit = Mock()
    tool.toolkit.slug = "toolkit"
    tool.output_parameters = {
        "type": "object",
        "properties": {
            "nested": {
                "oneOf": [
                    {"type": "object", "properties": {"x": {"type": "string"}}},
                    {"type": "string"},
                ]
            }
        },
    }

    resp = {"nested": {}}
    assert helper.substitute_file_downloads(tool=tool, response=resp) == resp
