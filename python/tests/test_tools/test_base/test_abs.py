"""Test abstractions"""

import re
from typing import Dict, List, Optional

import pytest
from pydantic import BaseModel, Field

from composio.tools.base.abs import (
    DEPRECATED_MARKER,
    Action,
    InvalidClassDefinition,
    Tool,
    ToolBuilder,
    action_registry,
    humanize_titles,
    remove_json_ref,
    tool_registry,
)


# pylint: disable=unused-variable,abstract-method,unused-argument


class TestActionBuilder:
    def test_missing_arguments(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape(
                "Invalid action class definition, please define your class "
                "using request and response type generics; class "
                "SomeAction(Action[RequestModel, ResponseModel])"
            ),
        ):

            class SomeAction(Action):
                def execute(self, request: dict, metadata: Dict) -> dict:
                    return {}

    def test_missing_method(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape("Please implement SomeAction.execute"),
        ):

            class SomeAction(Action):
                pass

    def test_metadata(self) -> None:
        class Request(BaseModel):
            pass

        class Response(BaseModel):
            pass

        class SomeAction(Action[Request, Response]):
            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        assert SomeAction.name == "some_action"
        assert SomeAction.enum == "SOME_ACTION"
        assert SomeAction.display_name == "Some action"
        assert SomeAction.description == "Some action"
        assert str(SomeAction.file) == __file__

    def test_deprecated_marker(self) -> None:

        class Request(BaseModel):
            pass

        class Response(BaseModel):
            pass

        class SomeAction(Action[Request, Response]):
            """Some action <<DEPRECATED use some_other_action>>"""

            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        assert (
            SomeAction.description == "Some action <<DEPRECATED use some_other_action>>"
        )
        assert DEPRECATED_MARKER in SomeAction.description


class TestToolBuilder:
    def test_humanize_field_titles(self) -> None:
        class TestClassWithFields(BaseModel):
            camelCase: str = Field(..., description="camel case field")
            snake_case: str = Field(..., description="snake case field")
            PascalCase: str = Field(..., description="pascal case field")

        class NestedClass(BaseModel):
            nestedField: str = Field(..., description="A nested field")

        class TestNestedClass(BaseModel):
            nestedObject: NestedClass = Field(..., description="A nested object")

        class TestClassWithNoFields(BaseModel):
            pass

        schema_with_fields = remove_json_ref(TestClassWithFields.model_json_schema())
        schema_with_nested_fields = remove_json_ref(TestNestedClass.model_json_schema())
        empty_schema = remove_json_ref(TestClassWithNoFields.model_json_schema())
        assert (
            humanize_titles(schema_with_fields["properties"])["camelCase"]["title"]
            == "Camel Case"
        )
        assert (
            humanize_titles(schema_with_fields["properties"])["snake_case"]["title"]
            == "Snake Case"
        )
        assert (
            humanize_titles(schema_with_fields["properties"])["PascalCase"]["title"]
            == "Pascal Case"
        )
        assert (
            humanize_titles(schema_with_nested_fields["properties"])["nestedObject"][
                "title"
            ]
            == "Nested Object"
        )
        assert (
            humanize_titles(schema_with_nested_fields["properties"])["nestedObject"][
                "properties"
            ]["nestedField"]["title"]
            == "Nested Field"
        )
        assert humanize_titles(empty_schema["properties"]) == {}

    def test_request_schema_titles_humanized(self) -> None:
        class NestedClass(BaseModel):
            nestedFieldProperty: str = Field(..., description="A nested field")

        class Request(BaseModel):
            camelCaseProperty: str = Field(..., description="camel case field")
            snake_case_property: str = Field(..., description="snake case field")
            PascalCaseProperty: str = Field(..., description="pascal case field")
            nestedObjectProperty: NestedClass = Field(
                ..., description="A nested object"
            )

        class Response(BaseModel):
            pass

        class SomeAction(Action[Request, Response]):
            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        request_schema = SomeAction.request.schema()  # type: ignore
        assert (
            request_schema["properties"]["camelCaseProperty"]["title"]
            == "Camel Case Property"
        )
        assert (
            request_schema["properties"]["snake_case_property"]["title"]
            == "Snake Case Property"
        )
        assert (
            request_schema["properties"]["PascalCaseProperty"]["title"]
            == "Pascal Case Property"
        )
        assert (
            request_schema["properties"]["nestedObjectProperty"]["title"]
            == "Nested Object Property"
        )
        assert (
            request_schema["properties"]["nestedObjectProperty"]["properties"][
                "nestedFieldProperty"
            ]["title"]
            == "Nested Field Property"
        )

    def test_request_schema_anyof_to_nullable_transformation(self) -> None:
        """Test that anyOf structures with null are converted to nullable properties."""

        class Request(BaseModel):
            # Required field (should not be affected)
            required_field: str = Field(..., description="A required field")

            # Optional string (should become nullable)
            optional_string: Optional[str] = Field(
                None, description="An optional string"
            )

            # Optional array (the main case we're fixing)
            optional_array: Optional[List[str]] = Field(
                None,
                description="An optional array of strings",
                examples=[["item1", "item2"], []],
            )

            # Optional nested object
            optional_dict: Optional[Dict[str, str]] = Field(
                None, description="An optional dictionary"
            )

        class Response(BaseModel):
            pass

        class TestAction(Action[Request, Response]):
            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        request_schema = TestAction.request.schema()
        properties = request_schema["properties"]

        # Required field should not have nullable or anyOf
        assert "anyOf" not in properties["required_field"]
        assert "nullable" not in properties["required_field"]
        assert properties["required_field"]["type"] == "string"

        # Optional string should be nullable without anyOf
        assert "anyOf" not in properties["optional_string"]
        assert properties["optional_string"]["nullable"] is True
        assert properties["optional_string"]["type"] == "string"

        # Optional array should be nullable array with items, without anyOf
        assert "anyOf" not in properties["optional_array"]
        assert properties["optional_array"]["nullable"] is True
        assert properties["optional_array"]["type"] == "array"
        assert "items" in properties["optional_array"]
        assert properties["optional_array"]["items"]["type"] == "string"
        assert properties["optional_array"]["default"] is None

        # Optional dict should be nullable without anyOf
        assert "anyOf" not in properties["optional_dict"]
        assert properties["optional_dict"]["nullable"] is True
        assert properties["optional_dict"]["type"] == "object"

    def test_missing_methods(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape("Please implement SomeTool.actions"),
        ):

            class SomeTool(Tool):
                logo = ""

                def execute(self, request: dict, metadata: Dict) -> dict:  # type: ignore
                    return {}

            ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))  # type: ignore

    def test_invalid_methods(self) -> None:
        with pytest.raises(
            InvalidClassDefinition,
            match=re.escape("Please implement SomeTool.actions as class method"),
        ):

            class SomeTool(Tool):
                logo = ""

                def actions(self) -> list:  # type: ignore
                    return []

            ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))

    def test_metadata(self) -> None:
        class SomeTool(Tool):
            logo = ""

            @classmethod
            def actions(cls) -> list:
                return []

        ToolBuilder.set_metadata(obj=SomeTool)

        assert SomeTool.name == "some_tool"
        assert SomeTool.enum == "SOME_TOOL"
        assert SomeTool.display_name == "Some tool"
        assert SomeTool.description == "Some tool"
        assert str(SomeTool.file) == __file__

    def test_setup_children(self) -> None:
        class Request(BaseModel):
            pass

        class Response(BaseModel):
            pass

        class SomeAction(Action[Request, Response]):
            def execute(self, request: Request, metadata: Dict) -> Response:
                return Response()

        class SomeTool(Tool):
            logo = ""

            @classmethod
            def actions(cls) -> list:
                return [SomeAction]

        ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))
        ToolBuilder.set_metadata(obj=SomeTool)
        ToolBuilder.setup_children(obj=SomeTool, no_auth=True)

        SomeTool.register()

        assert SomeAction.enum == "SOME_TOOL_SOME_ACTION"
        assert SomeAction.no_auth is True
        assert isinstance(tool_registry["local"][SomeTool.enum], SomeTool)
        assert action_registry["local"][SomeAction.enum] is SomeAction

    def test_description_builder(self) -> None:

        class SomeTool(Tool):
            """
            Some Tool

            With description.
            """

            logo = ""

            @classmethod
            def actions(cls) -> list:
                return []

        ToolBuilder.validate(obj=SomeTool, name="SomeTool", methods=("actions",))
        ToolBuilder.set_metadata(obj=SomeTool)
        ToolBuilder.setup_children(obj=SomeTool)

        assert SomeTool.description == "Some Tool With description."
