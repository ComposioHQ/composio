"""Cross-entry-point checks for primitive JSON Schema conversion."""

import pytest
from pydantic import ValidationError

from composio.utils.shared import pydantic_model_from_param_schema
from tests.fixtures.json_schema_conversion_corpus import find_case

PRIMITIVE_CASE_IDS = (
    "primitive-boolean-property-schemas",
    "primitive-empty-and-null-schemas",
    "primitive-type-array-union",
    "primitive-null-only-unions",
    "primitive-enum-intersects-declared-type",
    "primitive-scalar-constraints",
    "primitive-independent-numeric-bounds",
    "primitive-const-intersects-declared-type",
    "primitive-compound-enum-values",
    "primitive-const-null-and-false",
    "primitive-enum-boolean-number-identity",
    "primitive-enum-with-null-member",
    "primitive-const-constraint-conjunction",
    "primitive-inclusive-numeric-boundaries",
    "primitive-const-narrows-enum",
    "primitive-compound-const-deep-equality",
    "primitive-unicode-code-point-length",
    "primitive-typeless-constraint-scoping",
    "primitive-float-multiple-of",
    "primitive-draft4-boolean-exclusive-bounds",
    "primitive-type-array-constraint-scoping",
    "primitive-empty-enum-optional-property",
)


@pytest.mark.parametrize("case_id", PRIMITIVE_CASE_IDS)
def test_legacy_model_entry_point_matches_shared_primitive_corpus(case_id: str) -> None:
    case = find_case(case_id)
    model = pydantic_model_from_param_schema(
        {**case.schema_, "title": f"Primitive_{case_id}"}
    )

    for instance in case.instances:
        if instance.accepted_for("python"):
            model.model_validate(instance.input)
        else:
            with pytest.raises(ValidationError):
                model.model_validate(instance.input)
