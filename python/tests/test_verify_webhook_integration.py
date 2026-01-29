"""Integration tests for verify_webhook using fixtures.

These tests use the same fixtures as the TypeScript SDK to ensure
cross-SDK compatibility and algorithm correctness.
"""

import base64
import hashlib
import hmac
import json

import pytest

from composio import exceptions
from composio.core.models.triggers import Triggers, WebhookVersion
from tests.conftest import compute_signature, load_fixtures, load_golden_signatures


class TestVerifyWebhook:
    """Tests for webhook verification against fixture data."""

    @pytest.mark.parametrize(
        "fixture",
        load_fixtures(),
        ids=lambda f: f["description"],
    )
    def test_verify_fixture(self, triggers: Triggers, fixture: dict) -> None:
        """Verify each fixture passes verification."""
        result = triggers.verify_webhook(
            id=fixture["headers"]["webhook-id"],
            payload=fixture["payload"],
            signature=fixture["headers"]["webhook-signature"],
            timestamp=fixture["headers"]["webhook-timestamp"],
            secret=fixture["testSecret"],
            tolerance=0,
        )

        assert result["version"].value == fixture["expectedResult"]["version"]
        expected_slug = fixture["expectedResult"]["triggerSlug"]
        assert result["payload"]["trigger_slug"] == expected_slug

        if "userId" in fixture["expectedResult"]:
            assert result["payload"]["user_id"] == fixture["expectedResult"]["userId"]

        if "connectedAccountId" in fixture["expectedResult"]:
            assert (
                result["payload"]["metadata"]["connected_account"]["id"]
                == fixture["expectedResult"]["connectedAccountId"]
            )

        if "triggerId" in fixture["expectedResult"]:
            assert result["payload"]["id"] == fixture["expectedResult"]["triggerId"]

    @pytest.mark.parametrize(
        "version,expected_enum,expected_keys",
        [
            ("V3", WebhookVersion.V3, ["type", "metadata"]),
            ("V2", WebhookVersion.V2, ["type", "data"]),
            ("V1", WebhookVersion.V1, ["trigger_name", "connection_id"]),
        ],
    )
    def test_detects_version(
        self,
        triggers: Triggers,
        webhook_fixtures: list[dict],
        version: str,
        expected_enum: WebhookVersion,
        expected_keys: list[str],
    ) -> None:
        """Test version detection for V1, V2, V3."""
        fixture = next(
            (f for f in webhook_fixtures if f["expectedResult"]["version"] == version),
            None,
        )
        if fixture is None:
            pytest.skip(f"No {version} fixture found")

        result = triggers.verify_webhook(
            id=fixture["headers"]["webhook-id"],
            payload=fixture["payload"],
            signature=fixture["headers"]["webhook-signature"],
            timestamp=fixture["headers"]["webhook-timestamp"],
            secret=fixture["testSecret"],
            tolerance=0,
        )

        assert result["version"] == expected_enum
        for key in expected_keys:
            assert key in result["raw_payload"]


class TestGoldenSignatures:
    """Contract tests for signature algorithm."""

    @pytest.mark.parametrize(
        "test_case",
        load_golden_signatures()["testCases"],
        ids=lambda tc: tc["name"],
    )
    def test_produces_identical_signature(self, test_case: dict) -> None:
        """Verify signature algorithm produces identical output."""
        computed = compute_signature(
            test_case["id"],
            test_case["timestamp"],
            test_case["payload"],
            test_case["secret"],
        )
        assert computed == test_case["expectedSignature"]

    def test_algorithm_matches_documented_format(self, golden_signatures: dict) -> None:
        """Verify algorithm documentation."""
        assert golden_signatures["algorithm"] == "HMAC-SHA256"
        assert (
            golden_signatures["format"]
            == "v1,base64(HMAC-SHA256(id.timestamp.payload, secret))"
        )


class TestSignatureValidation:
    """Tests for signature algorithm validation."""

    def test_computes_signature_using_id_timestamp_payload_format(
        self, triggers: Triggers, webhook_fixtures: list[dict]
    ) -> None:
        """Verify signature is computed using id.timestamp.payload format."""
        fixture = webhook_fixtures[0]
        expected_signature = compute_signature(
            fixture["headers"]["webhook-id"],
            fixture["headers"]["webhook-timestamp"],
            fixture["payload"],
            fixture["testSecret"],
        )
        assert expected_signature == fixture["headers"]["webhook-signature"]

    def test_rejects_signature_computed_with_payload_only(
        self, triggers: Triggers, webhook_fixtures: list[dict]
    ) -> None:
        """Reject signature computed with only payload (wrong format)."""
        fixture = webhook_fixtures[0]
        wrong_signature = "v1," + base64.b64encode(
            hmac.new(
                key=fixture["testSecret"].encode("utf-8"),
                msg=fixture["payload"].encode("utf-8"),
                digestmod=hashlib.sha256,
            ).digest()
        ).decode("utf-8")

        with pytest.raises(exceptions.WebhookSignatureVerificationError):
            triggers.verify_webhook(
                id=fixture["headers"]["webhook-id"],
                payload=fixture["payload"],
                signature=wrong_signature,
                timestamp=fixture["headers"]["webhook-timestamp"],
                secret=fixture["testSecret"],
                tolerance=0,
            )

    def test_rejects_signature_missing_id(
        self, triggers: Triggers, webhook_fixtures: list[dict]
    ) -> None:
        """Reject signature computed with timestamp.payload (missing id)."""
        fixture = webhook_fixtures[0]
        to_sign = f"{fixture['headers']['webhook-timestamp']}.{fixture['payload']}"
        wrong_signature = "v1," + base64.b64encode(
            hmac.new(
                key=fixture["testSecret"].encode("utf-8"),
                msg=to_sign.encode("utf-8"),
                digestmod=hashlib.sha256,
            ).digest()
        ).decode("utf-8")

        with pytest.raises(exceptions.WebhookSignatureVerificationError):
            triggers.verify_webhook(
                id=fixture["headers"]["webhook-id"],
                payload=fixture["payload"],
                signature=wrong_signature,
                timestamp=fixture["headers"]["webhook-timestamp"],
                secret=fixture["testSecret"],
                tolerance=0,
            )


class TestPayloadStructure:
    """Tests for payload structure validation."""

    def test_preserves_exact_json_structure(
        self, triggers: Triggers, webhook_fixtures: list[dict]
    ) -> None:
        """Verify raw payload matches fixture exactly."""
        v3_fixture = next(
            (f for f in webhook_fixtures if f["expectedResult"]["version"] == "V3"),
            None,
        )
        if v3_fixture is None:
            pytest.skip("No V3 fixture found")

        result = triggers.verify_webhook(
            id=v3_fixture["headers"]["webhook-id"],
            payload=v3_fixture["payload"],
            signature=v3_fixture["headers"]["webhook-signature"],
            timestamp=v3_fixture["headers"]["webhook-timestamp"],
            secret=v3_fixture["testSecret"],
            tolerance=0,
        )

        parsed_payload = json.loads(v3_fixture["payload"])
        assert result["raw_payload"] == parsed_payload

    def test_normalizes_v3_payload(
        self, triggers: Triggers, webhook_fixtures: list[dict]
    ) -> None:
        """Verify V3 payload is normalized correctly."""
        v3_fixture = next(
            (f for f in webhook_fixtures if f["expectedResult"]["version"] == "V3"),
            None,
        )
        if v3_fixture is None:
            pytest.skip("No V3 fixture found")

        result = triggers.verify_webhook(
            id=v3_fixture["headers"]["webhook-id"],
            payload=v3_fixture["payload"],
            signature=v3_fixture["headers"]["webhook-signature"],
            timestamp=v3_fixture["headers"]["webhook-timestamp"],
            secret=v3_fixture["testSecret"],
            tolerance=0,
        )

        payload = result["payload"]
        assert "id" in payload
        assert "uuid" in payload
        assert "trigger_slug" in payload
        assert "toolkit_slug" in payload
        assert "user_id" in payload
        assert "payload" in payload
        assert "metadata" in payload
        assert "connected_account" in payload["metadata"]


class TestWhitespaceSensitivity:
    """Tests for whitespace sensitivity in payload verification."""

    def test_fails_verification_if_whitespace_changes(
        self, triggers: Triggers, webhook_fixtures: list[dict]
    ) -> None:
        """Verify whitespace changes cause verification failure."""
        fixture = webhook_fixtures[0]
        modified_payload = fixture["payload"].replace("{", "{ ")

        expected_errors = (
            exceptions.WebhookSignatureVerificationError,
            exceptions.WebhookPayloadError,
        )
        with pytest.raises(expected_errors):
            triggers.verify_webhook(
                id=fixture["headers"]["webhook-id"],
                payload=modified_payload,
                signature=fixture["headers"]["webhook-signature"],
                timestamp=fixture["headers"]["webhook-timestamp"],
                secret=fixture["testSecret"],
                tolerance=0,
            )

    def test_fails_verification_if_payload_reserialized(
        self, triggers: Triggers, webhook_fixtures: list[dict]
    ) -> None:
        """Verify re-serialization may cause verification failure."""
        fixture = webhook_fixtures[0]
        reserialized = json.dumps(json.loads(fixture["payload"]))

        # Only test if re-serialization actually changed the payload
        if reserialized != fixture["payload"]:
            expected_errors = (
                exceptions.WebhookSignatureVerificationError,
                exceptions.WebhookPayloadError,
            )
            with pytest.raises(expected_errors):
                triggers.verify_webhook(
                    id=fixture["headers"]["webhook-id"],
                    payload=reserialized,
                    signature=fixture["headers"]["webhook-signature"],
                    timestamp=fixture["headers"]["webhook-timestamp"],
                    secret=fixture["testSecret"],
                    tolerance=0,
                )


class TestFixtureConsistency:
    """Tests for fixture consistency."""

    def test_all_fixtures_use_same_test_secret(
        self, webhook_fixtures: list[dict]
    ) -> None:
        """Verify all fixtures use the same test secret."""
        secrets = {f["testSecret"] for f in webhook_fixtures}
        assert len(secrets) == 1
        assert "test-webhook-secret-for-fixtures" in secrets

    def test_all_fixtures_have_unique_webhook_ids(
        self, webhook_fixtures: list[dict]
    ) -> None:
        """Verify all fixtures have unique webhook IDs."""
        ids = [f["headers"]["webhook-id"] for f in webhook_fixtures]
        assert len(set(ids)) == len(webhook_fixtures)

    def test_fixtures_cover_all_supported_versions(
        self, webhook_fixtures: list[dict]
    ) -> None:
        """Verify fixtures cover V1, V2, and V3."""
        versions = {f["expectedResult"]["version"] for f in webhook_fixtures}
        assert {"V1", "V2", "V3"} <= versions
