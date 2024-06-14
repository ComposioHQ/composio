"""
Test collections module.
"""

from composio.client.collections import Trigger, trigger_names_str


class TestTriggerNamesSerialization:
    """Test `trigger_names_str` method."""

    def test_converts_trigger_objects_to_comma_separated_string(self):
        trigger_list = [
            Trigger.GITHUB_COMMIT_EVENT,
            Trigger.SLACK_NEW_MESSAGE,
            Trigger.YOUTUBE_NEW_YOUTUBE_ACTIVITY,
        ]
        result = trigger_names_str(trigger_list)
        assert (
            result
            == "github_commit_event,slack_receive_message,youtube_new_activity_trigger"
        )

    def test_converts_trigger_strings_to_comma_separated_string(self):
        trigger_list = [
            "github_commit_event",
            "slack_receive_message",
            "youtube_new_activity_trigger",
        ]
        result = trigger_names_str(trigger_list)
        assert (
            result
            == "github_commit_event,slack_receive_message,youtube_new_activity_trigger"
        )

    def test_converts_mix_of_trigger_objects_and_strings(self):
        trigger_list = [
            Trigger.GITHUB_COMMIT_EVENT,
            "slack_receive_message",
            Trigger.YOUTUBE_NEW_YOUTUBE_ACTIVITY,
        ]
        result = trigger_names_str(trigger_list)
        assert (
            result
            == "github_commit_event,slack_receive_message,youtube_new_activity_trigger"
        )
