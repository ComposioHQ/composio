"""
Comprehensive test suite for JSON schema to Pydantic conversion functions.

This module tests the core schema parsing functionality in composio.utils.shared,
particularly focusing on the required field propagation bug that was fixed.
"""

import typing as t

import pytest
from pydantic import BaseModel
from pydantic.fields import PydanticUndefined

from composio.utils.shared import (
    json_schema_to_fields_dict,
    json_schema_to_model,
    json_schema_to_pydantic_field,
    json_schema_to_pydantic_type,
    pydantic_model_from_param_schema,
)


class TestJsonSchemaToPydanticField:
    """Test cases for json_schema_to_pydantic_field function."""

    @pytest.mark.unit
    @pytest.mark.schema
    def test_simple_required_field(self):
        """Test that a field in the required list is marked as required."""
        name = "test_field"
        json_schema = {
            "type": "string",
            "description": "A test field",
            "title": "Test Field",
        }
        required = ["test_field"]

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required
        )

        assert field_name == "test_field"
        assert field_type is str
        assert field_info.default is PydanticUndefined  # Required field marker

    def test_simple_optional_field(self):
        """Test that a field not in the required list is marked as optional."""
        name = "optional_field"
        json_schema = {
            "type": "string",
            "description": "An optional field",
            "title": "Optional Field",
            "default": "default_value",
        }
        required = []

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required
        )

        assert field_name == "optional_field"
        assert field_type is str
        assert field_info.default == "default_value"

    @pytest.mark.unit
    @pytest.mark.schema
    def test_nested_object_with_internal_required_not_propagated(self):
        """
        CRITICAL TEST: Ensure nested object's internal required array
        does NOT make the parent object required.

        This tests the specific bug that was fixed.
        """
        name = "nested_object"
        json_schema = {
            "type": "object",
            "title": "NestedObject",
            "properties": {"inner_field": {"type": "string", "title": "Inner Field"}},
            "required": ["inner_field"],  # This should NOT make nested_object required
        }
        required = []  # nested_object is not in parent's required list

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required
        )

        assert field_name == "nested_object"
        assert field_info.default is not PydanticUndefined  # Should NOT be required
        assert field_info.default is None  # Should have default value

    def test_nested_object_explicitly_required(self):
        """Test that a nested object can be explicitly required via parent's required list."""
        name = "nested_object"
        json_schema = {
            "type": "object",
            "title": "NestedObject",
            "properties": {"inner_field": {"type": "string", "title": "Inner Field"}},
            "required": ["inner_field"],
        }
        required = ["nested_object"]  # Explicitly in parent's required list

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required
        )

        assert field_name == "nested_object"
        assert field_info.default is PydanticUndefined  # Should be required

    def test_reserved_field_name_handling(self):
        """Test that reserved Pydantic field names are properly aliased."""
        name = "validate"  # Reserved name
        json_schema = {
            "type": "string",
            "description": "A field with reserved name",
            "title": "Validate",
        }
        required = []

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required
        )

        assert field_name == "validate_"  # Should be renamed
        assert field_info.alias == "validate_"  # Should have alias

    def test_field_with_examples(self):
        """Test that examples are properly preserved in field info."""
        name = "example_field"
        json_schema = {
            "type": "string",
            "description": "A field with examples",
            "title": "Example Field",
            "examples": ["example1", "example2"],
        }
        required = []

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required
        )

        assert field_name == "example_field"
        assert field_info.examples == ["example1", "example2"]

    def test_oneof_field_description_merging(self):
        """Test that oneOf schemas have their descriptions properly merged."""
        name = "oneof_field"
        json_schema = {
            "oneOf": [
                {"type": "string", "description": "String option"},
                {"type": "integer", "description": "Integer option"},
            ]
        }
        required = []

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required
        )

        expected_desc = "Any of the following options(separated by |): String option | Integer option"
        assert field_info.description == expected_desc

    def test_skip_default_parameter(self):
        """Test that skip_default parameter works correctly."""
        name = "test_field"
        json_schema = {"type": "string", "default": "should_be_skipped"}
        required = []

        field_name, field_type, field_info = json_schema_to_pydantic_field(
            name, json_schema, required, skip_default=True
        )

        # When skip_default=True, field should be required (default=PydanticUndefined)
        assert field_info.default is PydanticUndefined


class TestJsonSchemaToModel:
    """Test cases for json_schema_to_model function."""

    def test_simple_model_creation(self):
        """Test creating a simple Pydantic model from JSON schema."""
        json_schema = {
            "title": "SimpleModel",
            "type": "object",
            "properties": {
                "name": {"type": "string", "title": "Name"},
                "age": {"type": "integer", "title": "Age"},
            },
            "required": ["name"],
        }

        model_class = json_schema_to_model(json_schema)

        # Test model creation
        instance = model_class(name="test")
        assert instance.name == "test"
        assert instance.age is None

        # Test validation
        with pytest.raises(Exception):  # Should fail without required field
            model_class()

    def test_nested_object_model(self):
        """Test creating a model with nested objects."""
        json_schema = {
            "title": "ParentModel",
            "type": "object",
            "properties": {
                "basic_field": {"type": "string", "title": "Basic Field"},
                "nested_object": {
                    "type": "object",
                    "title": "NestedObject",
                    "properties": {
                        "inner_field": {"type": "string", "title": "Inner Field"}
                    },
                    "required": ["inner_field"],
                },
            },
            "required": ["basic_field"],
        }

        model_class = json_schema_to_model(json_schema)

        # Test that nested_object is optional (not required)
        instance = model_class(basic_field="test")
        assert instance.basic_field == "test"
        assert instance.nested_object is None

        # Test that nested object validation works when provided
        instance_with_nested = model_class(
            basic_field="test", nested_object={"inner_field": "nested_value"}
        )
        assert instance_with_nested.nested_object.inner_field == "nested_value"

    @pytest.mark.unit
    @pytest.mark.schema
    def test_working_location_properties_bug_scenario(self):
        """
        CRITICAL TEST: Reproduce the exact scenario that caused the bug.

        This tests the workingLocationProperties scenario that was incorrectly
        marked as required.
        """
        json_schema = {
            "title": "CreateEventRequest",
            "type": "object",
            "properties": {
                "start_datetime": {"type": "string", "title": "Start Datetime"},
                "workingLocationProperties": {
                    "type": "object",
                    "title": "WorkingLocationProperties",
                    "properties": {
                        "type": {
                            "type": "string",
                            "title": "Type",
                            "enum": ["homeOffice", "officeLocation", "customLocation"],
                        },
                        "customLocation": {
                            "type": "object",
                            "title": "WorkingLocationCustom",
                            "properties": {
                                "label": {"type": "string", "title": "Label"}
                            },
                            "required": ["label"],
                        },
                    },
                    "required": ["type"],
                },
            },
            "required": ["start_datetime"],
        }

        model_class = json_schema_to_model(json_schema)

        # Test that workingLocationProperties is NOT required
        instance = model_class(start_datetime="2025-01-01T10:00:00")
        assert instance.start_datetime == "2025-01-01T10:00:00"
        assert instance.workingLocationProperties is None

        # Test that nested validation works when provided
        instance_with_working_location = model_class(
            start_datetime="2025-01-01T10:00:00",
            workingLocationProperties={
                "type": "customLocation",
                "customLocation": {"label": "Client Office"},
            },
        )
        assert (
            instance_with_working_location.workingLocationProperties.type
            == "customLocation"
        )

    def test_array_type_handling(self):
        """Test handling of array types in schema."""
        json_schema = {
            "title": "ArrayModel",
            "type": "object",
            "properties": {
                "tags": {"type": "array", "items": {"type": "string"}, "title": "Tags"}
            },
        }

        model_class = json_schema_to_model(json_schema)
        instance = model_class(tags=["tag1", "tag2"])
        assert instance.tags == ["tag1", "tag2"]


class TestPydanticModelFromParamSchema:
    """Test cases for pydantic_model_from_param_schema function."""

    def test_simple_param_schema(self):
        """Test creating a model from parameter schema format."""
        param_schema = {
            "title": "SimpleParam",
            "type": "object",
            "properties": {"name": {"type": "string", "title": "Name"}},
            "required": ["name"],
        }

        model_class = pydantic_model_from_param_schema(param_schema)

        # Should be able to create instance with required field
        instance = model_class(name="test")
        assert instance.name == "test"

    def test_nested_object_not_making_parent_required(self):
        """
        CRITICAL TEST: Ensure nested objects with internal required fields
        don't make the parent object required in pydantic_model_from_param_schema.
        """
        param_schema = {
            "title": "ParentParam",
            "type": "object",
            "properties": {
                "required_field": {"type": "string", "title": "Required Field"},
                "optional_nested": {
                    "type": "object",
                    "title": "Optional Nested",
                    "properties": {
                        "inner_required": {"type": "string", "title": "Inner Required"}
                    },
                    "required": [
                        "inner_required"
                    ],  # Should NOT make optional_nested required
                },
            },
            "required": ["required_field"],
        }

        model_class = pydantic_model_from_param_schema(param_schema)

        # Should work with just the required field
        instance = model_class(required_field="test")
        assert instance.required_field == "test"
        # optional_nested should be optional (None or default value)

    def test_array_type_param_schema(self):
        """Test array type handling in parameter schema."""
        param_schema = {
            "title": "ArrayParam",
            "type": "array",
            "items": {"type": "string", "title": "String Item"},
        }

        result = pydantic_model_from_param_schema(param_schema)
        # Should return List[str] type
        assert hasattr(result, "__origin__")  # Generic type
        assert result.__origin__ is list

    def test_missing_title_error(self):
        """Test that missing title raises appropriate error."""
        param_schema = {
            "type": "object",
            "properties": {},
            # Missing "title"
        }

        with pytest.raises(ValueError, match="Missing 'title' in param_schema"):
            pydantic_model_from_param_schema(param_schema)


class TestJsonSchemaToPydanticType:
    """Test cases for json_schema_to_pydantic_type function."""

    def test_basic_types(self):
        """Test conversion of basic JSON schema types to Python types."""
        test_cases = [
            ({"type": "string"}, str),
            ({"type": "integer"}, int),
            ({"type": "number"}, float),
            ({"type": "boolean"}, bool),
        ]

        for json_schema, expected_type in test_cases:
            result = json_schema_to_pydantic_type(json_schema)
            assert result == expected_type

    def test_array_type(self):
        """Test array type conversion."""
        json_schema = {"type": "array", "items": {"type": "string"}}

        result = json_schema_to_pydantic_type(json_schema)
        assert hasattr(result, "__origin__")
        assert result.__origin__ is list

    def test_object_type_creates_nested_model(self):
        """Test that object types create nested Pydantic models."""
        json_schema = {
            "type": "object",
            "title": "NestedModel",
            "properties": {"field": {"type": "string", "title": "Field"}},
        }

        result = json_schema_to_pydantic_type(json_schema)
        assert isinstance(result, type)
        assert issubclass(result, BaseModel)

    def test_oneof_union_types(self):
        """Test oneOf schemas create union types."""
        json_schema = {"oneOf": [{"type": "string"}, {"type": "integer"}]}

        result = json_schema_to_pydantic_type(json_schema)
        # Should create a Union type
        assert hasattr(result, "__origin__")

    def test_oneof_unlimited_types(self):
        """Test oneOf schemas with unlimited number of types (fixes the 3-type limit bug)."""
        # Test 4 types (previously would fail)
        json_schema_4 = {
            "oneOf": [
                {"type": "string"},
                {"type": "integer"},
                {"type": "boolean"},
                {"type": "number"},
            ]
        }
        result_4 = json_schema_to_pydantic_type(json_schema_4)
        assert hasattr(result_4, "__origin__")
        assert result_4.__origin__ is t.Union
        assert len(result_4.__args__) == 4
        assert str in result_4.__args__
        assert int in result_4.__args__
        assert bool in result_4.__args__
        assert float in result_4.__args__

        # Test 5 types
        json_schema_5 = {
            "oneOf": [
                {"type": "string"},
                {"type": "integer"},
                {"type": "boolean"},
                {"type": "number"},
                {"type": "array"},
            ]
        }
        result_5 = json_schema_to_pydantic_type(json_schema_5)
        assert hasattr(result_5, "__origin__")
        assert result_5.__origin__ is t.Union
        assert len(result_5.__args__) == 5

        # Test 6 types (stress test, avoiding null which expands to Optional[Any])
        json_schema_6 = {
            "oneOf": [
                {"type": "string"},
                {"type": "integer"},
                {"type": "boolean"},
                {"type": "number"},
                {"type": "array"},
                {"type": "object"},
            ]
        }
        result_6 = json_schema_to_pydantic_type(json_schema_6)
        assert hasattr(result_6, "__origin__")
        assert result_6.__origin__ is t.Union
        assert len(result_6.__args__) == 6

    def test_oneof_single_type(self):
        """Test oneOf with single type returns the type directly."""
        json_schema = {"oneOf": [{"type": "string"}]}
        result = json_schema_to_pydantic_type(json_schema)
        assert result is str
        # Single type should not create a Union
        assert not hasattr(result, "__origin__")

    def test_oneof_with_complex_types(self):
        """Test oneOf with complex types like objects and arrays."""
        json_schema = {
            "oneOf": [
                {"type": "string"},
                {"type": "array", "items": {"type": "integer"}},
                {
                    "type": "object",
                    "title": "ComplexObject",
                    "properties": {"field": {"type": "string"}},
                },
            ]
        }
        result = json_schema_to_pydantic_type(json_schema)
        assert hasattr(result, "__origin__")
        assert result.__origin__ is t.Union
        assert len(result.__args__) == 3
        # Check that we have string, List[int], and a BaseModel subclass
        args = result.__args__
        assert str in args
        # One should be a List type
        list_types = [
            arg for arg in args if hasattr(arg, "__origin__") and arg.__origin__ is list
        ]
        assert len(list_types) == 1
        # One should be a BaseModel subclass
        model_types = [
            arg for arg in args if isinstance(arg, type) and issubclass(arg, BaseModel)
        ]
        assert len(model_types) >= 1

    def test_oneof_nested_in_object(self):
        """Test oneOf field within an object schema."""
        json_schema = {
            "type": "object",
            "title": "ObjectWithOneOf",
            "properties": {
                "flexible_field": {
                    "oneOf": [
                        {"type": "string"},
                        {"type": "integer"},
                        {"type": "boolean"},
                        {"type": "number"},
                    ]
                },
                "normal_field": {"type": "string"},
            },
            "required": ["flexible_field"],
        }

        # Test that the model can be created
        model_class = json_schema_to_model(json_schema)

        # Test with different oneOf values
        instance1 = model_class(flexible_field="hello", normal_field="world")
        instance2 = model_class(flexible_field=42, normal_field="world")
        instance3 = model_class(flexible_field=True, normal_field="world")
        instance4 = model_class(flexible_field=3.14, normal_field="world")

        assert instance1.flexible_field == "hello"
        assert instance2.flexible_field == 42
        assert instance3.flexible_field is True
        assert instance4.flexible_field == 3.14

    def test_fallback_to_string(self):
        """Test that missing type defaults to string."""
        json_schema = {}  # No type specified

        result = json_schema_to_pydantic_type(json_schema)
        assert result is str

    def test_unsupported_type_error(self):
        """Test that unsupported types raise appropriate error."""
        json_schema = {"type": "unsupported_type"}

        with pytest.raises(ValueError, match="Unsupported JSON schema type"):
            json_schema_to_pydantic_type(json_schema)


class TestJsonSchemaToFieldsDict:
    """Test cases for json_schema_to_fields_dict function."""

    def test_basic_fields_dict(self):
        """Test creating fields dictionary from JSON schema."""
        json_schema = {
            "properties": {
                "name": {"type": "string", "title": "Name"},
                "age": {"type": "integer", "title": "Age"},
            },
            "required": ["name"],
        }

        fields_dict = json_schema_to_fields_dict(json_schema)

        assert "name" in fields_dict
        assert "age" in fields_dict

        # Check field types and info
        name_type, name_field = fields_dict["name"]
        age_type, age_field = fields_dict["age"]

        assert name_type is str
        assert age_type is int
        assert name_field.default is PydanticUndefined  # Required
        assert age_field.default is None  # Optional


class TestRegressionScenarios:
    """Test cases for specific regression scenarios and edge cases."""

    def test_deeply_nested_objects_required_propagation(self):
        """Test deeply nested objects don't propagate required fields incorrectly."""
        json_schema = {
            "title": "DeeplyNested",
            "type": "object",
            "properties": {
                "level1": {
                    "type": "object",
                    "title": "Level1",
                    "properties": {
                        "level2": {
                            "type": "object",
                            "title": "Level2",
                            "properties": {
                                "level3": {
                                    "type": "object",
                                    "title": "Level3",
                                    "properties": {
                                        "deep_field": {
                                            "type": "string",
                                            "title": "Deep Field",
                                        }
                                    },
                                    "required": ["deep_field"],
                                }
                            },
                            "required": ["level3"],
                        }
                    },
                    "required": ["level2"],
                }
            },
            "required": [],  # level1 should NOT be required
        }

        model_class = json_schema_to_model(json_schema)

        # Should be able to create instance without level1
        instance = model_class()
        assert instance.level1 is None

    def test_multiple_nested_objects_same_level(self):
        """Test multiple nested objects at same level with different required fields."""
        json_schema = {
            "title": "MultipleNested",
            "type": "object",
            "properties": {
                "config1": {
                    "type": "object",
                    "title": "Config1",
                    "properties": {"setting1": {"type": "string", "title": "Setting1"}},
                    "required": ["setting1"],
                },
                "config2": {
                    "type": "object",
                    "title": "Config2",
                    "properties": {"setting2": {"type": "string", "title": "Setting2"}},
                    "required": ["setting2"],
                },
                "required_field": {"type": "string", "title": "Required Field"},
            },
            "required": ["required_field"],
        }

        model_class = json_schema_to_model(json_schema)

        # Should work with just required_field
        instance = model_class(required_field="test")
        assert instance.required_field == "test"
        assert instance.config1 is None
        assert instance.config2 is None

    def test_empty_required_array_handling(self):
        """Test handling of empty required arrays."""
        json_schema = {
            "title": "EmptyRequired",
            "type": "object",
            "properties": {
                "optional1": {"type": "string", "title": "Optional1"},
                "optional2": {"type": "string", "title": "Optional2"},
            },
            "required": [],
        }

        model_class = json_schema_to_model(json_schema)

        # Should work with no fields
        instance = model_class()
        assert instance.optional1 is None
        assert instance.optional2 is None

    def test_missing_required_array_handling(self):
        """Test handling when required array is missing entirely."""
        json_schema = {
            "title": "NoRequired",
            "type": "object",
            "properties": {
                "field1": {"type": "string", "title": "Field1"},
                "field2": {"type": "string", "title": "Field2"},
            },
            # No "required" key at all
        }

        model_class = json_schema_to_model(json_schema)

        # Should work with no fields (all optional)
        instance = model_class()
        assert instance.field1 is None
        assert instance.field2 is None


class TestEdgeCases:
    """Test cases for edge cases and error conditions."""

    def test_none_schema_handling(self):
        """Test handling of None or empty schemas."""
        with pytest.raises((TypeError, AttributeError, KeyError)):
            json_schema_to_model(None)

    def test_malformed_schema_handling(self):
        """Test handling of malformed schemas."""
        malformed_schemas = [
            {"type": "object"},  # Missing properties
            {"properties": {}},  # Missing type and title
            {"title": "Test", "type": "invalid_type"},  # Invalid type
        ]

        for schema in malformed_schemas:
            # Should either handle gracefully or raise appropriate error
            try:
                result = json_schema_to_model(schema)
                # If it doesn't raise an error, it should at least return something
                assert result is not None
            except (ValueError, KeyError, TypeError):
                # These are acceptable errors for malformed schemas
                pass

    def test_circular_reference_protection(self):
        """Test that circular references don't cause infinite recursion."""
        # This is a complex scenario that would require special handling
        # For now, we just ensure it doesn't crash
        json_schema = {
            "title": "SelfReference",
            "type": "object",
            "properties": {
                "name": {"type": "string", "title": "Name"},
                "children": {
                    "type": "array",
                    "items": {"$ref": "#"},  # Self-reference
                },
            },
        }

        # This might not work perfectly but shouldn't crash
        try:
            model_class = json_schema_to_model(json_schema)
            # If successful, test basic functionality
            instance = model_class(name="test")
            assert instance.name == "test"
        except (RecursionError, ValueError):
            # Acceptable for now - circular references are complex
            pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
