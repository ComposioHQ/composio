"""
Test collections module.
"""

from logging import DEBUG
from unittest import mock

import pytest

import composio
from composio.client import Composio
from composio.client.collections import (
    ActiveTriggerModel,
    Trigger,
    TriggerEventData,
    TriggerSubscription,
    to_trigger_names,
)
from composio.exceptions import ComposioSDKError
from composio.utils import logging


class TestTriggerNamesSerialization:
    """Test `trigger_names_str` method."""

    def test_converts_trigger_objects_to_comma_separated_string(self):
        trigger_list = [
            Trigger.GITHUB_COMMIT_EVENT,
            Trigger.SLACK_RECEIVE_MESSAGE,
            Trigger.YOUTUBE_NEW_ACTIVITY_TRIGGER,
        ]
        result = to_trigger_names(trigger_list)
        assert (
            result
            == "GITHUB_COMMIT_EVENT,SLACK_RECEIVE_MESSAGE,YOUTUBE_NEW_ACTIVITY_TRIGGER"
        )

    def test_converts_trigger_strings_to_comma_separated_string(self):
        trigger_list = [
            "GITHUB_COMMIT_EVENT",
            "SLACK_RECEIVE_MESSAGE",
            "YOUTUBE_NEW_ACTIVITY_TRIGGER",
        ]
        result = to_trigger_names(trigger_list)
        assert (
            result
            == "GITHUB_COMMIT_EVENT,SLACK_RECEIVE_MESSAGE,YOUTUBE_NEW_ACTIVITY_TRIGGER"
        )

    def test_converts_mix_of_trigger_objects_and_strings(self):
        trigger_list = [
            Trigger.GITHUB_COMMIT_EVENT,
            "slack_receive_message",
            Trigger.YOUTUBE_NEW_ACTIVITY_TRIGGER,
        ]
        result = to_trigger_names(trigger_list)
        assert (
            result
            == "GITHUB_COMMIT_EVENT,SLACK_RECEIVE_MESSAGE,YOUTUBE_NEW_ACTIVITY_TRIGGER"
        )


def test_trigger_subscription(capsys, caplog) -> None:
    """Test trigger subscription multiplexing."""
    logging.setup(logging.LogLevel.DEBUG)
    subscription = TriggerSubscription(Composio.get_latest())
    subscription.set_alive()

    @subscription.callback(filters={"trigger_id": "trigger_1"})
    def _callback_1(event: TriggerEventData) -> None:  # pylint: disable=unused-argument
        print("Trigger 1 called from callback 1")

    @subscription.callback(filters={"trigger_id": "trigger_1"})
    def _callback_2(event: TriggerEventData) -> None:  # pylint: disable=unused-argument
        print("Trigger 1 called from callback 2")

    @subscription.callback(filters={"trigger_id": "trigger_2"})
    def _callback_3(event: TriggerEventData) -> None:  # pylint: disable=unused-argument
        print("Trigger 2 called from callback 3")

    with mock.patch.object(
        subscription,
        "_parse_payload",
        return_value=mock.Mock(
            metadata=mock.Mock(
                id="trigger_1",
            )
        ),
    ), caplog.at_level(DEBUG):
        subscription.handle_event(event="")

    assert (
        "Trigger 1 called from callback 1\n"
        "Trigger 1 called from callback 2\n" in capsys.readouterr().out
    )

    assert (
        "Skipping `_callback_3` since `trigger_id` filter does not match the event metadata"
        in caplog.text
    )

    with mock.patch.object(
        subscription,
        "_parse_payload",
        return_value=mock.Mock(
            metadata=mock.Mock(
                id="trigger_2",
            )
        ),
    ), caplog.at_level(DEBUG):
        subscription.handle_event(event="")

    assert (
        "Skipping `_callback_1` since `trigger_id` filter does not match the event metadata"
        in caplog.text
    )
    assert (
        "Skipping `_callback_2` since `trigger_id` filter does not match the event metadata"
        in caplog.text
    )
    assert "Trigger 2 called from callback 3\n" in capsys.readouterr().out


def test_trigger_filters(capsys, caplog) -> None:
    """Test trigger callback filters."""
    logging.setup(logging.LogLevel.DEBUG)
    subscription = TriggerSubscription(Composio.get_latest())
    subscription.set_alive()

    @subscription.callback(filters={"trigger_id": "trigger_1"})
    def _callback_1(event: TriggerEventData) -> None:  # pylint: disable=unused-argument
        print("Trigger 1 called from callback 1")

    with mock.patch.object(
        subscription,
        "_parse_payload",
        return_value=mock.Mock(
            metadata=mock.Mock(
                id="TRIGGER_1",
            )
        ),
    ), caplog.at_level(DEBUG):
        subscription.handle_event(event="")

    assert "Trigger 1 called from callback 1" in capsys.readouterr().out


def test_trigger_filter_errors() -> None:
    """Test trigger callback filters."""
    sub = TriggerSubscription(Composio.get_latest())

    with pytest.raises(ComposioSDKError) as exc:
        sub.callback(filters={"app_name": "does_not_exist"})

    assert (
        exc.value.message
        == "App 'DOES_NOT_EXIST' does not exist.\nRead more here: https://docs.composio.dev/introduction/intro/quickstart_3"
    )

    # Ensure hackernews app is cached
    # TODO: remove this once App.iter() uses a dedicated endpoint
    # for fetching latest enums
    composio.App.HACKERNEWS.load()
    with pytest.raises(ComposioSDKError) as exc:
        sub.callback(filters={"app_name": "hacker_news"})

    assert (
        exc.value.message
        == "App 'HACKER_NEWS' does not exist. Did you mean 'HACKERNEWS'?\nRead more here: https://docs.composio.dev/introduction/intro/quickstart_3"
    )

    # Ensure the trigger is cached
    # TODO: remove this once Trigger.iter() uses a dedicated endpoint
    # for fetching latest enums
    composio.Trigger.GMAIL_NEW_GMAIL_MESSAGE.load()
    with pytest.raises(ComposioSDKError) as exc:
        sub.callback(filters={"triggerName": "gmail_new_gmail_message"})  # type: ignore

    assert (
        exc.value.message
        == "Unexpected filter 'triggerName' Did you mean 'trigger_name'?\nRead more here: https://docs.composio.dev/introduction/intro/quickstart_3"
    )

    with pytest.raises(ComposioSDKError) as exc:
        sub.callback(filters={"trigger_name": "gmail_new_message"})

    assert (
        exc.value.message
        == "Trigger 'GMAIL_NEW_MESSAGE' does not exist. Did you mean 'GMAIL_NEW_GMAIL_MESSAGE'?\nRead more here: https://docs.composio.dev/introduction/intro/quickstart_3"
    )


def test_trigger_filter_errors_not_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure that trigger filters fail if the given app or trigger is not enabled."""
    client = Composio.get_latest()
    sub = TriggerSubscription(client)

    def make_trigger(name: str):
        return ActiveTriggerModel(
            id=name, connectionId=name, triggerName=name, triggerConfig={}
        )

    # Ensure the trigger is cached
    # TODO: remove this once Trigger.iter() uses a dedicated endpoint
    # for fetching latest enums
    composio.Trigger.GMAIL_NEW_GMAIL_MESSAGE.load()

    # Ensure trigger is enabled on the account
    monkeypatch.setattr(
        client.active_triggers,
        "get",
        lambda: [
            make_trigger("GITHUB_COMMIT_EVENT"),
            make_trigger("SLACK_RECEIVE_MESSAGE"),
        ],
    )
    with pytest.raises(ComposioSDKError) as exc:
        sub.callback(filters={"trigger_name": "GMAIL_NEW_GMAIL_MESSAGE"})

    assert (
        exc.value.message
        == "Trigger 'GMAIL_NEW_GMAIL_MESSAGE' is not enabled on your account.\n"
        "Enable the trigger by doing `composio triggers enable GMAIL_NEW_GMAIL_MESSAGE`.\nRead more here: https://docs.composio.dev/introduction/intro/quickstart_3"
    )

    # Ensure the app is cached
    # TODO: remove this once App.iter() uses a dedicated endpoint
    # for fetching latest enums
    composio.App.ATTIO.load()

    # Ensure the app being enabled has at least one enabled trigger on the account
    monkeypatch.setattr(
        client.active_triggers,
        "get",
        lambda: [
            make_trigger("GITHUB_COMMIT_EVENT"),
            make_trigger("SLACK_RECEIVE_MESSAGE"),
        ],
    )
    with pytest.raises(ComposioSDKError) as exc:
        sub.callback(filters={"app_name": "ATTIO"})

    assert (
        exc.value.message
        == "App 'ATTIO' has no triggers enabled on your account.\nFind the possible triggers by running `composio triggers`.\nRead more here: https://docs.composio.dev/introduction/intro/quickstart_3"
    )
