"""Tests for x402 pay-per-call handling on the tool-execution path."""

from __future__ import annotations

import base64
import json

import pytest

from composio.core.models.x402 import (
    PaymentAction,
    X402Accept,
    X402ParseError,
    parse_x402_envelope,
    x402_after_execute,
)


def _accept(**kw):
    base = {
        "scheme": "exact",
        "network": "nano:mainnet",
        "asset": "XNO",
        "amount": "173000000000000000000000000000",
        "payTo": "nano_1yo6c1",
    }
    base.update(kw)
    return base


class TestParseEnvelope:
    def test_v2_payment_required_shape(self):
        body = {
            "x402Version": 2,
            "price_xno": "0.0001",
            "pay_to": "nano_1yo6c1",
            "accepts": [
                _accept(),
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
        env = parse_x402_envelope(
            '{"accepts":[{"scheme":"exact","network":"nano:mainnet","asset":"XNO",'
            '"amount":"1","payTo":"nano_1yo6c1"}]}'
        )
        assert len(env.accepts) == 1
        env2 = parse_x402_envelope(
            b'{"accepts":[{"scheme":"exact","network":"nano:mainnet","asset":"XNO",'
            b'"amount":"1","payTo":"nano_1yo6c1"}]}'
        )
        assert len(env2.accepts) == 1

    def test_incomplete_accept_rejected(self):
        # An accept without an amount / destination cannot be quoted; it must be
        # rejected so a malformed offer never reaches a payer.
        with pytest.raises(X402ParseError):
            parse_x402_envelope(
                {"accepts": [_accept(amount=None)]}
            )
        with pytest.raises(X402ParseError):
            parse_x402_envelope(
                {"accepts": [_accept(payTo=None, pay_to=None)]}
            )

    def test_offers_filter(self):
        env = parse_x402_envelope(
            {"accepts": [_accept(), _accept(network="eip155:8453", asset="USDC", amount="1")]}
        )
        assert env.offers("exact", "nano:mainnet", "XNO") is not None
        assert env.offers("exact", "bogus", "XNO") is None
        assert env.offers("unknown") is None

    def test_payment_required_header_base64url(self):
        envelope = {
            "x402Version": 2,
            "price_xno": "0.0001",
            "accepts": [_accept()],
        }
        header = base64.urlsafe_b64encode(
            json.dumps(envelope).encode("utf-8")
        ).decode("ascii")
        env = parse_x402_envelope(None, payment_required_header=header)
        assert env.price == "0.0001"
        assert env.offers("exact", "nano:mainnet", "XNO") is not None

    def test_payment_required_header_plain_json(self):
        header = json.dumps({"accepts": [_accept()]})
        env = parse_x402_envelope(b"", payment_required_header=header)
        assert len(env.accepts) == 1

    @pytest.mark.parametrize(
        "bad",
        [
            "not-json",
            "{}",
            '{"accepts":[]}',
            "[]",
            '{"accepts":"x"}',
            # incomplete accept (no amount / no payTo)
            '{"accepts":[{"scheme":"exact","network":"nano:mainnet","asset":"XNO"}]}',
            '{"accepts":[{"scheme":"exact","network":"nano:mainnet","asset":"XNO","amount":"1"}]}',
        ],
    )
    def test_malformed_raises(self, bad):
        with pytest.raises(X402ParseError):
            parse_x402_envelope(bad)

    def test_bad_header_raises(self):
        with pytest.raises(X402ParseError):
            parse_x402_envelope(None, payment_required_header="not-an-envelope")


class TestX402AfterExecute:
    def _apply(self, mod, tool, toolkit, resp):
        """Helper to apply a modifier, matching the _modifiers.Modifier.apply interface."""
        return mod.apply(toolkit=toolkit, tool=tool, data=resp, modifer_type="after_execute")

    def test_non_402_response_untouched(self):
        mod = x402_after_execute(lambda env: PaymentAction(settled=True), toolkits=["http"])
        resp = {"data": {"foo": "bar"}, "error": None, "successful": True}
        assert self._apply(mod, "HTTPS_REQUEST", "http", resp) is resp

    def test_successful_response_with_accepts_does_not_pay(self):
        # A successful (non-402) response whose payload merely contains an
        # `accepts` key must never trigger a payment (greptile P1).
        mod = x402_after_execute(lambda env: PaymentAction(settled=True), toolkits=["http"])
        resp = {"data": {"status": 200, "accepts": ["some", "data"]}, "error": None, "successful": True}
        assert self._apply(mod, "HTTPS_REQUEST", "http", resp) is resp

    def test_successful_response_with_accepts_and_marker_does_not_pay(self):
        # Even a body that pairs `accepts[]` with attacker-controlled marker keys
        # (x402Version/price/amount/payment_required) must NOT trigger a payment
        # when the transport did not signal 402 nor send a payment-required
        # header.  The body is controlled by the remote server; only a real
        # transport signal (402 status / payment-required header) may cause
        # settlement (parameterai P1, cursor "Generic keys trigger payment").
        for body in (
            {"accepts": [{"scheme": "exact"}], "x402Version": 2},
            {"accepts": [{"scheme": "exact"}], "price": "0.0001"},
            {"accepts": [{"scheme": "exact"}], "amount": "1"},
            {"accepts": [{"scheme": "exact"}], "payment_required": True},
        ):
            resp = {"data": {"status": 200, "body": body}, "error": None, "successful": True}
            assert self._apply(mod, "HTTPS_REQUEST", "http", resp) is resp

    def test_payment_required_header_upper_case_is_recognized(self):
        # x402 v2 ships the envelope in the uppercase `PAYMENT-REQUIRED` header;
        # tool responses may preserve that casing.  Matching is case-insensitive,
        # so the offer must reach the payer (cursor "Spec header name not
        # recognized").
        def payer(env):
            return PaymentAction(settled=True, payment_ref="HUP")

        mod = x402_after_execute(payer, toolkits=["http"])
        header = base64.urlsafe_b64encode(
            json.dumps({"x402Version": 2, "accepts": [_accept()]}).encode("utf-8")
        ).decode("ascii")
        resp = {"data": {"status": 402, "headers": {"PAYMENT-REQUIRED": header}}, "error": None, "successful": False}
        out = self._apply(mod, "HTTPS_REQUEST", "http", resp)
        assert out["data"]["payment_ref"] == "HUP"
        assert out["data"]["retry_required"] is True

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
        assert out["data"]["retry_required"] is True

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
        assert "retry_required" not in out["data"]

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

    def test_incomplete_offer_no_payment(self):
        # An accepts entry missing amount/payTo must be treated as malformed and
        # never paid (greptile P2 "incomplete offers pass validation").
        mod = x402_after_execute(lambda env: PaymentAction(settled=True, payment_ref="X"), toolkits=["http"])
        resp = {
            "data": {"status": 402, "body": {"accepts": [_accept(amount=None)]}},
            "error": None,
            "successful": False,
        }
        out = self._apply(mod, "HTTPS_REQUEST", "http", resp)
        assert out["data"]["payment_required"] is True
        assert "malformed x402 envelope" in out["data"]["payment_error"]
        assert "payment_ref" not in out["data"]

    def test_header_offer_settled(self):
        def payer(env):
            return PaymentAction(settled=True, payment_ref="HB1")

        mod = x402_after_execute(payer, toolkits=["http"])
        header = base64.urlsafe_b64encode(
            json.dumps({"x402Version": 2, "accepts": [_accept()]}).encode("utf-8")
        ).decode("ascii")
        resp = {"data": {"status": 402, "headers": {"payment-required": header}}, "error": None, "successful": False}
        out = self._apply(mod, "HTTPS_REQUEST", "http", resp)
        assert out["data"]["payment_ref"] == "HB1"
        assert out["data"]["retry_required"] is True

    def test_no_payer_still_signals(self):
        # A no-payer modifier must still run and surface the debt (it runs, it
        # just cannot settle) - the modifier is not unusable (greptile P1).
        mod = x402_after_execute(None, toolkits=["http"])
        resp = {
            "data": {"status": 402, "body": {"accepts": [_accept()]}},
            "error": None,
            "successful": False,
        }
        out = self._apply(mod, "HTTPS_REQUEST", "http", resp)
        assert out["data"]["payment_required"] is True
        assert "no payer configured" in out["data"]["payment_error"]

    def test_decorator_form_can_apply_payer(self):
        x402_after_execute(toolkits=["http"])
        dec = x402_after_execute(toolkits=["http"])
        mod = dec(lambda env: PaymentAction(settled=True, payment_ref="D1"))
        assert hasattr(mod, "apply")

    def test_requires_payer_or_scoping(self):
        with pytest.raises(ValueError):
            x402_after_execute()
