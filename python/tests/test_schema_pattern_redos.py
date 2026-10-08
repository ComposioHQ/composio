"""Schema-supplied regexes must not stall validation (SEC-1178).

Tool schemas are third-party input, and the strings matched against their
patterns (tool arguments, object keys) are attacker-influenced. Every pattern
runs on pydantic's linear-time Rust regex, or on Python `re` only when a static
check proves it cannot backtrack catastrophically.

None of these tests may compare a catastrophic input against the stock
`jsonschema` oracle: that oracle runs Python `re` and would hang.
"""

import time
import typing as t

import pytest
from jsonschema import Draft201909Validator, Draft202012Validator
from pydantic import TypeAdapter, ValidationError

from composio.utils import schema_converter
from composio.utils.schema_converter import json_schema_to_pydantic_type
from composio.utils.shared import json_schema_to_model

# Look-around forces the `re` fallback; the nested quantifier is exponential.
LOOKAROUND_CATASTROPHIC = "^(?=a)(a+)+$"
# The Rust engine compiles this, so it must be enforced in linear time.
RUST_CATASTROPHIC = "^(a+)+$"
EVIL = "a" * 40 + "!"
TIME_LIMIT = 1.0


class _Timer:
    def __enter__(self) -> "_Timer":
        self.started = time.perf_counter()
        return self

    def __exit__(self, *_: t.Any) -> None:
        self.elapsed = time.perf_counter() - self.started


def _adapter(schema: t.Dict[str, t.Any]) -> TypeAdapter:
    return TypeAdapter(json_schema_to_pydantic_type(schema))


@pytest.fixture
def warnings(monkeypatch: pytest.MonkeyPatch) -> t.List[str]:
    """Capture converter warnings; clear the warn-once matcher cache."""
    schema_converter._string_pattern_matcher.cache_clear()
    messages: t.List[str] = []

    def capture(message: str, *args: t.Any, **_: t.Any) -> None:
        messages.append(message % args)

    monkeypatch.setattr(schema_converter.logger, "warning", capture)
    return messages


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("entry_point", ["model", "type"])
def test_rust_supported_pattern_property_routes_keys_in_linear_time(
    entry_point: str,
) -> None:
    schema = {
        "type": "object",
        "title": "Routed",
        "patternProperties": {RUST_CATASTROPHIC: {"type": "integer"}},
        "additionalProperties": {"type": "string"},
    }
    validate: t.Callable[[t.Any], t.Any]
    if entry_point == "model":
        model = json_schema_to_model(schema)
        validate = model.model_validate
    else:
        validate = _adapter(schema).validate_python

    with _Timer() as timer:
        validate({"aaa": 1, EVIL: "routed to additionalProperties"})
        with pytest.raises(ValidationError):
            validate({"aaa": "matching key must be an integer"})
        with pytest.raises(ValidationError):
            validate({EVIL: 1})
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
def test_lookaround_catastrophic_pattern_is_not_enforced(
    warnings: t.List[str],
) -> None:
    schema = {
        "type": "object",
        "properties": {"value": {"type": "string", "pattern": LOOKAROUND_CATASTROPHIC}},
    }
    model = json_schema_to_model(schema)
    assert any(LOOKAROUND_CATASTROPHIC in message for message in warnings)

    with _Timer() as timer:
        model.model_validate({"value": EVIL})
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
def test_forced_fallback_polynomial_pattern_is_not_enforced(
    warnings: t.List[str],
) -> None:
    pattern = "(?=a).*.*.*.*.*!"
    assert not schema_converter._fallback_pattern_is_safe(pattern)
    adapter = _adapter({"type": "string", "pattern": pattern})
    assert any(pattern in message for message in warnings)

    with _Timer() as timer:
        assert adapter.validate_python("a" * 900) == "a" * 900
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    "pattern",
    [
        "^(?=a){1000000000}a$",
        "^z|(?=a)" + "(?:a|aa)" * 5 + "a*a*b$",
    ],
)
def test_fixed_repeats_and_unanchored_alternatives_are_not_enforced(
    pattern: str,
    warnings: t.List[str],
) -> None:
    # Assert rejection before matching, so a regression cannot execute the attack.
    assert not schema_converter._fallback_pattern_is_safe(pattern)
    adapter = _adapter({"type": "string", "pattern": pattern})
    assert any(pattern in message for message in warnings)
    value = "a" * schema_converter._BACKTRACKING_FALLBACK_MAX_INPUT
    assert adapter.validate_python(value) == value


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("entry_point", ["model", "type"])
@pytest.mark.parametrize("pattern", [LOOKAROUND_CATASTROPHIC, "^(?=a)"])
def test_lookaround_pattern_property_is_rejected_at_conversion(
    entry_point: str,
    pattern: str,
) -> None:
    # Key patterns decide routing, so they are never dropped and never run on
    # Python `re`, even when the static check would accept them.
    schema = {
        "type": "object",
        "title": "Keys",
        "patternProperties": {pattern: {"type": "integer"}},
    }
    convert = json_schema_to_model if entry_point == "model" else _adapter
    with pytest.raises(ValueError, match="Unsupported patternProperties"):
        convert(schema)


@pytest.mark.unit
@pytest.mark.schema
def test_nested_lookaround_pattern_property_is_rejected_at_conversion() -> None:
    schema = {
        "type": "object",
        "title": "Nested",
        "anyOf": [
            {"patternProperties": {LOOKAROUND_CATASTROPHIC: {"type": "integer"}}},
            {"required": ["x"]},
        ],
    }
    with pytest.raises(ValueError, match="Unsupported patternProperties"):
        json_schema_to_model(schema)


@pytest.mark.unit
@pytest.mark.schema
def test_invalid_pattern_property_keeps_invalid_error() -> None:
    schema = {"type": "object", "patternProperties": {"(": {"type": "integer"}}}
    with pytest.raises(ValueError, match="Invalid patternProperties"):
        _adapter(schema)


@pytest.mark.unit
@pytest.mark.schema
def test_safe_lookaround_pattern_is_enforced_on_bounded_input() -> None:
    adapter = _adapter({"type": "string", "pattern": "^(?=.*[a-y])a"})
    assert adapter.validate_python("ab") == "ab"
    with pytest.raises(ValidationError):
        adapter.validate_python("ba")
    with pytest.raises(ValidationError):
        adapter.validate_python("z" * 1000)

    # Past the fallback input cap the constraint widens to "satisfied".
    long_value = "z" * (schema_converter._BACKTRACKING_FALLBACK_MAX_INPUT + 1)
    assert adapter.validate_python(long_value) == long_value


@pytest.mark.unit
@pytest.mark.schema
def test_typeless_catastrophic_patterns_complete_in_linear_time() -> None:
    enforced = _adapter({"pattern": RUST_CATASTROPHIC, "minLength": 1})
    ignored = _adapter({"pattern": LOOKAROUND_CATASTROPHIC, "minLength": 1})

    with _Timer() as timer:
        with pytest.raises(ValidationError):
            enforced.validate_python(EVIL)
        assert enforced.validate_python("aaa") == "aaa"
        assert enforced.validate_python(1) == 1
        assert ignored.validate_python(EVIL) == EVIL
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    "dynamic_keyword", ["patternProperties", "additionalProperties"]
)
def test_catastrophic_pattern_inside_dynamic_key_schema(dynamic_keyword: str) -> None:
    def schema_for(pattern: str) -> t.Dict[str, t.Any]:
        value_schema = {"type": "string", "pattern": pattern}
        dynamic: t.Any = (
            {"^k": value_schema}
            if dynamic_keyword == "patternProperties"
            else value_schema
        )
        return {"type": "object", "title": "Dynamic", dynamic_keyword: dynamic}

    enforced = json_schema_to_model(schema_for(RUST_CATASTROPHIC))
    ignored = json_schema_to_model(schema_for(LOOKAROUND_CATASTROPHIC))

    with _Timer() as timer:
        with pytest.raises(ValidationError):
            enforced.model_validate({"k1": EVIL})
        enforced.model_validate({"k1": "aaa"})
        ignored.model_validate({"k1": EVIL})
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
def test_catastrophic_pattern_inside_any_of_branch() -> None:
    def schema_for(pattern: str) -> t.Dict[str, t.Any]:
        return {
            "type": "object",
            "properties": {
                "value": {
                    "anyOf": [
                        {"type": "string", "pattern": pattern},
                        {"type": "integer"},
                    ]
                }
            },
        }

    enforced = json_schema_to_model(schema_for(RUST_CATASTROPHIC))
    ignored = json_schema_to_model(schema_for(LOOKAROUND_CATASTROPHIC))

    with _Timer() as timer:
        with pytest.raises(ValidationError):
            enforced.model_validate({"value": EVIL})
        enforced.model_validate({"value": "aaa"})
        enforced.model_validate({"value": 1})
        ignored.model_validate({"value": EVIL})
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    ("validator_class", "dialect"),
    [
        (Draft201909Validator, "https://json-schema.org/draft/2019-09/schema"),
        (Draft202012Validator, "https://json-schema.org/draft/2020-12/schema"),
    ],
)
def test_unevaluated_properties_match_keys_in_linear_time(
    validator_class: t.Any,
    dialect: str,
) -> None:
    keyword = schema_converter._with_safe_regex_keywords(validator_class).VALIDATORS[
        "unevaluatedProperties"
    ]
    # Fails if a jsonschema upgrade stops the key matching from being rebound.
    assert keyword is not schema_converter._unsupported_unevaluated_properties

    schema = {
        "$schema": dialect,
        "type": "object",
        "additionalProperties": {
            "type": "object",
            "patternProperties": {RUST_CATASTROPHIC: {"type": "integer"}},
            "unevaluatedProperties": False,
        },
    }
    adapter = _adapter(schema)
    with _Timer() as timer:
        adapter.validate_python({"x": {"aaa": 1}})
        with pytest.raises(ValidationError):
            adapter.validate_python({"x": {EVIL: 1}})
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
def test_subschema_dialect_switch_keeps_linear_regex() -> None:
    # jsonschema switches to its stock validator class for any subschema that
    # declares `$schema`; the regex overrides must survive that switch.
    schema = {
        "type": "object",
        "title": "DialectSwitch",
        "properties": {
            "value": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "text": {"type": "string", "pattern": RUST_CATASTROPHIC}
                },
                "patternProperties": {RUST_CATASTROPHIC: {"type": "integer"}},
                "additionalProperties": False,
            }
        },
    }
    model = json_schema_to_model(schema)
    with _Timer() as timer:
        model.model_validate({"value": {"aaa": 1, "text": "aaa"}})
        with pytest.raises(ValidationError):
            model.model_validate({"value": {EVIL: 1}})
        with pytest.raises(ValidationError):
            model.model_validate({"value": {"text": EVIL}})
    assert timer.elapsed < TIME_LIMIT


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("entry_point", ["model", "type"])
@pytest.mark.parametrize(
    ("draft", "keyword"),
    [
        (draft, keyword)
        for draft in ["2019-09", "2020-12"]
        for keyword in [
            "dependentSchemas",
            "unevaluatedProperties",
            "unevaluatedItems",
            "prefixItems",
        ]
        if keyword != "prefixItems" or draft == "2020-12"
    ],
)
def test_switched_dialect_rejects_unsupported_key_patterns_at_conversion(
    entry_point: str,
    draft: str,
    keyword: str,
) -> None:
    unsupported = {
        "type": "object",
        "patternProperties": {"^(?=a)": {"type": "integer"}},
    }
    value: t.Any = unsupported
    if keyword == "dependentSchemas":
        value = {"trigger": unsupported}
    elif keyword == "prefixItems":
        value = [unsupported]
    schema = {
        "type": "object",
        "properties": {
            "value": {
                "$schema": f"https://json-schema.org/draft/{draft}/schema",
                "type": "array"
                if keyword in {"prefixItems", "unevaluatedItems"}
                else "object",
                keyword: value,
            }
        },
    }
    convert = json_schema_to_model if entry_point == "model" else _adapter
    with pytest.raises(ValueError, match="Unsupported patternProperties"):
        convert(schema)


@pytest.mark.unit
@pytest.mark.schema
def test_draft7_keeps_unsupported_dialect_keywords_as_annotations() -> None:
    schema = {
        "type": "object",
        "dependentSchemas": {
            "trigger": {"patternProperties": {"^(?=a)": {"type": "integer"}}}
        },
    }
    assert _adapter(schema).validate_python({"trigger": "annotation"}) == {
        "trigger": "annotation"
    }


@pytest.mark.unit
@pytest.mark.schema
def test_shared_reference_is_checked_under_each_effective_dialect() -> None:
    schema = {
        "type": "object",
        "properties": {
            "old": {"$ref": "#/x"},
            "new": {
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "$ref": "#/x",
            },
        },
        "x": {
            "type": "object",
            "dependentSchemas": {
                "trigger": {"patternProperties": {"^(?=a)": {"type": "integer"}}}
            },
        },
    }
    with pytest.raises(ValueError, match="Unsupported patternProperties"):
        _adapter(schema)


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    "pattern",
    [
        "^(?=.*[a-y])a",
        "^(?=a){2}ab$",
        "(?<=a)b",
        r"^(?=.*[a-z])(?=.*\d)[A-Za-z\d]{8,}$",
        "^(?=x)(jpg|png|gif)$",
    ],
)
def test_static_check_accepts_bounded_patterns(pattern: str) -> None:
    assert schema_converter._fallback_pattern_is_safe(pattern)


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    "pattern",
    [
        "(a+)+",
        "(?=(a+)+)",
        # sre folds `(a|b)` into a character class, which is linear; a
        # multi-character alternation stays an alternation.
        "(a|bc)*",
        r"(a)\1",
        "(?P<x>a)(?P=x)",
        "(a)?(?(1)b|c)",
        "(?=(?=a))",
        ".*.*x",
        "(?=.*a.*b)x",
        "(?=a).*.*.*.*.*!",
        "(?=a)" + "a?" * 7,
        "(?<=)" + "(?:a|aa)" * 7 + "b",
        "^(?=a){1000000000}a$",
        "^(?=a)a{1000000000}$",
        "^(?=a)a{1,1000000000}$",
        "^(?=a)a{1000000000,}$",
        "^((?=a){64}){64}a$",
        "^(?=a)b|b+b+c",
        "^z|(?=a)" + "(?:a|aa)" * 5 + "a*a*b$",
        "(?m)^a*a*(?=b)b$",
    ],
)
def test_static_check_rejects_backtracking_patterns(pattern: str) -> None:
    assert not schema_converter._fallback_pattern_is_safe(pattern)
