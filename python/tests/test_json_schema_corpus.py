"""Checks for decoding the shared JSON Schema fixtures."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from tests.fixtures import json_schema_conversion_corpus as corpus


@pytest.mark.parametrize("default_encoding", ["cp936", "cp1252"])
@pytest.mark.parametrize("strict", [False, True], ids=["object", "strict"])
def test_corpus_uses_utf8_independently_of_locale(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, default_encoding: str, strict: bool
) -> None:
    glyph = "\U0001d11e"
    case: dict[str, object] = {
        "id": "unicode-fixture",
        "description": glyph,
        "schema": {"type": "object"},
    }
    if strict:
        case["strict"] = {"schema": {"type": "object"}}
        path_attribute = "STRICT_CORPUS_PATH"
        cache_attribute = "_cached_strict"
    else:
        case["instances"] = [{"input": {"glyph": glyph}, "accepted": True}]
        path_attribute = "CORPUS_PATH"
        cache_attribute = "_cached"

    load = corpus.load_strict_cases if strict else corpus.load_object_cases

    fixture_path = tmp_path / "corpus.json"
    fixture_path.write_text(
        json.dumps({"cases": [case]}, ensure_ascii=False), encoding="utf-8"
    )
    monkeypatch.setattr(corpus, path_attribute, fixture_path)
    monkeypatch.setattr(corpus, cache_attribute, None)

    original_read_text = Path.read_text

    def read_text_with_locale_default(path, encoding=None, errors=None):
        # Emulate a Windows locale without changing the host's global locale.
        if path == fixture_path and encoding is None:
            encoding = default_encoding
        return original_read_text(path, encoding=encoding, errors=errors)

    with patch.object(Path, "read_text", read_text_with_locale_default):
        cases = load()

    assert cases[0].description == glyph
    if not strict:
        assert corpus.load_object_cases()[0].instances[0].input == {"glyph": glyph}
    assert load() is cases
