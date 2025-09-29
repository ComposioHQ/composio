#!/usr/bin/env python3
"""
Simple validation tests for schema parser functions.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pydantic.fields import PydanticUndefined
from composio.utils.shared import (
    json_schema_to_model,
    json_schema_to_pydantic_field,
)


def test_basic_functionality():
    """Basic smoke test for schema parser functions."""
    print("🧪 Testing basic schema parser functionality...")
    
    # Test 1: Simple required field
    name = "test_field"
    json_schema = {
        "type": "string",
        "description": "A test field",
        "title": "Test Field"
    }
    required = ["test_field"]

    field_name, field_type, field_info = json_schema_to_pydantic_field(
        name, json_schema, required
    )
    
    assert field_name == "test_field"
    assert field_type == str
    assert field_info.default is PydanticUndefined  # Required field marker
    print("✅ Test 1 passed: Simple required field")
    
    # Test 2: Optional field with nested required (the bug scenario)
    name = "nested_object"
    json_schema = {
        "type": "object",
        "title": "NestedObject",
        "properties": {
            "inner_field": {
                "type": "string",
                "title": "Inner Field"
            }
        },
        "required": ["inner_field"]  # This should NOT make nested_object required
    }
    required = []  # nested_object is not in parent's required list

    field_name, field_type, field_info = json_schema_to_pydantic_field(
        name, json_schema, required
    )

    assert field_name == "nested_object"
    assert field_info.default is not PydanticUndefined  # Should NOT be required
    print("✅ Test 2 passed: Nested object with internal required not propagated")
    
    # Test 3: Full model creation (workingLocationProperties scenario)
    json_schema = {
        "title": "CreateEventRequest",
        "type": "object",
        "properties": {
            "start_datetime": {
                "type": "string",
                "title": "Start Datetime"
            },
            "workingLocationProperties": {
                "type": "object",
                "title": "WorkingLocationProperties",
                "properties": {
                    "type": {
                        "type": "string",
                        "title": "Type"
                    }
                },
                "required": ["type"]  # Should NOT make workingLocationProperties required
            }
        },
        "required": ["start_datetime"]
    }

    model_class = json_schema_to_model(json_schema)

    # Test that workingLocationProperties is NOT required
    instance = model_class(start_datetime="2025-01-01T10:00:00")
    assert instance.start_datetime == "2025-01-01T10:00:00"
    assert instance.workingLocationProperties is None
    print("✅ Test 3 passed: workingLocationProperties bug scenario fixed")
    
    print("\n🎉 All tests passed! Schema parser is working correctly.")
    return True


if __name__ == "__main__":
    try:
        test_basic_functionality()
        print("\n✅ SUCCESS: All schema parser tests passed!")
        exit(0)
    except Exception as e:
        print(f"\n❌ FAILED: Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
