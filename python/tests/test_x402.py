"""Tests for x402 pay-per-call handling on the tool-execution path."""

from __future__ import annotations

import pytest

from composio.core.models.x402 import (
    PaymentAction,
    X402Accept,
    X402ParseError,
    parse_x402_envelope,
    x402_after_execute,
)


def _accept(**kw):
    base = {"scheme": "exact", "network": "nano:mainnet", "asset": "XNO"}
    base.update(kw)
    return base


class TestParseEnvelope:
    def test_v2_payment_required_shape(self):
        body = {
            "x402Version": 2,
            "price_xno": "0.0001",
            "pay_to": "nano_1yo6c1",
            "accepts": [
                _accept(payTo="nano_1yo6c1", amount="173000000000000000000000000000"),
                _accept(network="eip155:8453", asset="USDC", amount="10000"),
            ],
        }
        env = parse_x402_envelope(body)
        assert len(env.accepts) == 2
        assert env.price == "0.0001"
        assert env.pay_to == "nano_1yo6c1"
        assert env.offers("exact", "nano:mainnet", "XNO") == env.accepts[0]
        assert env.accepts[0].key == "exact:nano:mainnet:XNO"

    def test_string_and_bytes_bodies(self):
        env = parse_x402_envelope('{"accepts":[{"scheme":"exact","network":"nano:mainnet","asset":"XNO"}]}')
        assert len(env.accepts) == 1
        env2 = parse_x402_envelope(b'{"accepts":[{"scheme":"exact","network":"nano:mainnet","asset":"XNO"}]}')
        assert len(env2.accepts) == 1

    def test_offers_filter(self):
        env = parse_x402_envelope(
            {"accepts": [_accept(), _accept(network="eip155:8453", asset="USDC")]}
        )
        assert env.offers("exact", "nano:mainnet", "XNO") is not None
        assert env.offers("exact", "bogus", "XNO") is None
        assert env.offers("unknown") is None

    @pytest.mark.parametrize(
        "bad",
        [
            "not-json",
            "{}",
            '{"accepts":[]}',
            "[]",
            '{"accepts":"x"}',
            '{"accepts":[{"network":"nano:mainnet"}]}',
        ],
    )
    def test_malformed_raises(self, bad):
        with pytest.raises(X402ParseError):
            parse_x402_envelope(bad)


class TestX402AfterExecute:
    def _apply(self, mod, tool, toolkit, resp):
        """Helper to apply a modifier, matching the _modifiers.Modifier.apply interface."""
        return mod.apply(toolkit=toolkit, tool=tool, data=resp, modifer_type="after_execute")

    def test_non_402_response_untouched(self):
        mod = x402_after_execute(lambda env: PaymentAction(settled=True), toolkits=["http"])
        resp = {"data": {"foo": "bar"}, "error": None, "successful": True}
        assert self._apply(mod, "HTTPS_REQUEST", "http", resp) is resp

    def test_payer_settles_sets_retry_and_ref(self):
        def payer(env):
            return PaymentAction(settled=True, payment_ref="BLOCK123", message="paid")

        mod = x402_after_execute(payer, toolkits=["http"])
        resp = {
            "data": {"status": 402, "body": {"accepts": [_accept()]}},
            "error": None,
            "successful": False,
        }
        out = self._apply(mod, "HTTPS_REQUEST", "http", resp)
        assert out["data"]["payment_required"] is False
        assert out["data"]["payment_ref"] == "BLOCK123"
        assert out["data"]["_retry"] is True

    def test_payer_refuses_signals_payment_required(self):
        def payer(env):
            return PaymentAction(settled=False, message="below spend cap")

        mod = x402_after_execute(payer, toolkits=["http"])
        resp = {
            "data": {"status": 402, "body": {"accepts": [_accept()]}},
            "error": None,
            "successful": False,
        }
        out = self._apply(mod, "HTTPS_REQUEST", "http", resp)
        assert out["data"]["payment_required"] is True
        assert out["data"]["payment_message"] == "below spend cap"
        assert "_retry" not in out["data"]

    def test_malformed_envelope_no_payment(self):
        mod = x402_after_execute(lambda env: PaymentAction(settled=True), toolkits=["http"])
        resp = {
            "data": {"status": 402, "body": "garbage"},
            "error": None,
            "successful": False,
        }
        out = self._apply(mod, "HTTPS_REQUEST", "http", resp)
        assert out["data"]["payment_required"] is True
        assert "malformed x402 envelope" in out["data"]["payment_error"]
        assert "payment_ref" not in out["data"]

    def test_direct_body_shape_detected(self):
        mod = x402_after_execute(lambda env: PaymentAction(settled=True, payment_ref="B1"), toolkits=["http"])
        resp = {"data": {"accepts": [_accept()]}, "error": None, "successful": False}
        out = self._apply(mod, "X_TOOL", "http", resp)
        assert out["data"]["payment_ref"] == "B1"

    def test_requires_payer_or_scoping(self):
        with pytest.raises(ValueError):
            x402_after_execute()
