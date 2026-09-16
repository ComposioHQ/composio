"""Decoder for the shared cross-SDK JSON Schema conversion corpus.

The corpus is one logical fixture with a byte-identical copy per language. This
module resolves the Python copy module-relatively and decodes it into typed
models, so a malformed corpus fails at the test boundary rather than surfacing
as a confusing assertion error deep inside a converter test.
"""

import json
import typing as t
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

CORPUS_PATH = Path(__file__).parent / "json-schema-conversion" / "object-cases.json"
STRICT_CORPUS_PATH = (
    Path(__file__).parent / "json-schema-conversion" / "strict-cases.json"
)

Language = t.Literal["zod", "effect", "python"]
LANGUAGES: t.Tuple[Language, ...] = ("zod", "effect", "python")

_UNSET = object()


class LanguageExpectation(BaseModel):
    """Per-language expectation. `output` is absent when the case does not pin one."""

    model_config = ConfigDict(extra="forbid")

    output: t.Any = _UNSET
    accepted: t.Optional[bool] = None

    @property
    def has_output(self) -> bool:
        return self.output is not _UNSET


class Divergence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1)


class CorpusInstance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: t.Dict[str, t.Any]
    accepted: bool
    zod: t.Optional[LanguageExpectation] = None
    effect: t.Optional[LanguageExpectation] = None
    python: t.Optional[LanguageExpectation] = None
    divergence: t.Optional[Divergence] = None

    def accepted_for(self, language: Language) -> bool:
        """Acceptance for one language: the shared flag unless a declared divergence overrides it."""
        expectation: t.Optional[LanguageExpectation] = getattr(self, language)
        if expectation is not None and expectation.accepted is not None:
            return expectation.accepted
        return self.accepted


class Ingress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: bool
    preserved: t.Dict[str, t.Any]


class CorpusCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    description: t.Optional[str] = None
    divergesFromJsonSchema: t.Optional[str] = None  # noqa: N815
    schema_: t.Dict[str, t.Any] = Field(alias="schema")
    ingress: t.Optional[Ingress] = None
    instances: t.List[CorpusInstance] = Field(min_length=1)


class Corpus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cases: t.List[CorpusCase] = Field(min_length=1)


def assert_corpus_invariants(cases: t.Sequence[CorpusCase]) -> None:
    """Ids are unique, and a language may only disagree about acceptance when it says why."""
    seen: t.Set[str] = set()
    for case in cases:
        if case.id in seen:
            raise ValueError(f"Duplicate corpus case id: {case.id}")
        seen.add(case.id)

        for index, instance in enumerate(case.instances):
            for language in LANGUAGES:
                expectation: t.Optional[LanguageExpectation] = getattr(
                    instance, language
                )
                override = expectation.accepted if expectation else None
                if (
                    override is not None
                    and override != instance.accepted
                    and instance.divergence is None
                ):
                    raise ValueError(
                        f"Corpus case {case.id} instance {index} overrides {language} "
                        "acceptance without a divergence reason"
                    )


_cached: t.Optional[t.List[CorpusCase]] = None


def load_object_cases() -> t.List[CorpusCase]:
    """Decode the shared corpus and enforce its cross-language invariants."""
    global _cached
    if _cached is None:
        cases = Corpus.model_validate(json.loads(CORPUS_PATH.read_text())).cases
        assert_corpus_invariants(cases)
        _cached = cases
    return _cached


def find_case(case_id: str) -> CorpusCase:
    """Look up one case by id, failing loudly when the corpus no longer carries it."""
    for case in load_object_cases():
        if case.id == case_id:
            return case
    raise LookupError(f"Corpus is missing the {case_id} case")


class StrictIncompatibility(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    keyword: str = Field(min_length=1)


class StrictChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    reason: str = Field(min_length=1)


class StrictArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: t.Dict[str, t.Any]
    output: t.Dict[str, t.Any]


class StrictExpectation(BaseModel):
    """Either the exact strict schema, or the constructs reported as unsupported."""

    model_config = ConfigDict(extra="forbid")

    schema_: t.Optional[t.Dict[str, t.Any]] = Field(default=None, alias="schema")
    unsupported: t.Optional[t.List[StrictIncompatibility]] = Field(
        default=None, min_length=1
    )


class StrictCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    description: t.Optional[str] = None
    schema_: t.Dict[str, t.Any] = Field(alias="schema")
    strict: StrictExpectation
    changes: t.Optional[t.List[StrictChange]] = None
    arguments: t.Optional[t.List[StrictArguments]] = None


class StrictCorpus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cases: t.List[StrictCase] = Field(min_length=1)


_cached_strict: t.Optional[t.List[StrictCase]] = None


def load_strict_cases() -> t.List[StrictCase]:
    """Decode the shared strict-mode corpus (byte-identical copy per language)."""
    global _cached_strict
    if _cached_strict is None:
        cases = StrictCorpus.model_validate(
            json.loads(STRICT_CORPUS_PATH.read_text())
        ).cases
        seen: t.Set[str] = set()
        for case in cases:
            if case.id in seen:
                raise ValueError(f"Duplicate strict case id: {case.id}")
            seen.add(case.id)
            if (case.strict.schema_ is None) == (case.strict.unsupported is None):
                raise ValueError(f"Strict case {case.id} must pin exactly one outcome")
        _cached_strict = cases
    return _cached_strict
