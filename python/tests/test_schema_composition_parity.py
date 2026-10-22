"""Cross-entry-point checks for composed JSON Schema conversion."""

import pytest
from pydantic import TypeAdapter, ValidationError

from composio.utils.shared import pydantic_model_from_param_schema
from tests.fixtures.json_schema_conversion_corpus import find_case

COMPOSITION_CASE_IDS = (
    "composition-fixed-tuple-items",
    "composition-open-tuple-items",
    "composition-false-tuple-position",
    "composition-allof-object-intersection",
    "composition-scalar-allof",
    "composition-oneof-exclusive-match",
)


@pytest.mark.parametrize("case_id", COMPOSITION_CASE_IDS)
def test_legacy_model_entry_point_matches_shared_composition_corpus(
    case_id: str,
) -> None:
    case = find_case(case_id)
    model = pydantic_model_from_param_schema(
        {**case.schema_, "title": f"Composition_{case_id}"}
    )

    for instance in case.instances:
        if instance.accepted_for("python"):
            model.model_validate(instance.input)
        else:
            with pytest.raises(ValidationError):
                model.model_validate(instance.input)


def test_standalone_draft7_tuple_preserves_positional_validation() -> None:
    adapter = TypeAdapter(
        pydantic_model_from_param_schema(
            {
                "title": "StandaloneTuple",
                "type": "array",
                "items": [{"type": "string"}, {"type": "integer"}],
                "additionalItems": False,
            }
        )
    )

    assert adapter.validate_python([]) == []
    assert adapter.validate_python(["ready"]) == ["ready"]
    assert adapter.validate_python(["ready", 2]) == ["ready", 2]
    for value in ([2, "ready"], ["ready", 2, True]):
        with pytest.raises(ValidationError):
            adapter.validate_python(value)
