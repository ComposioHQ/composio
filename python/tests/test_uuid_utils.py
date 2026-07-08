"""Tests for the uuid utility module."""

import uuid as uuid_lib

from composio.utils.uuid import generate_short_id, generate_uuid


def test_generate_uuid_is_a_valid_uuid4():
    value = generate_uuid()
    parsed = uuid_lib.UUID(value)
    assert parsed.version == 4
    # Round-trips back to the same canonical string.
    assert str(parsed) == value


def test_generate_uuid_is_random():
    assert generate_uuid() != generate_uuid()


def test_generate_short_id_is_eight_hex_chars():
    short = generate_short_id()
    assert len(short) == 8
    assert all(c in "0123456789abcdef" for c in short)


def test_generate_short_id_has_no_dashes():
    assert "-" not in generate_short_id()


def test_generate_short_id_is_random():
    # Collisions are possible in theory but astronomically unlikely here.
    assert generate_short_id() != generate_short_id()
