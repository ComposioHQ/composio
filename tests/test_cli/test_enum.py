import unittest
from composio.client.enums import Tag, App, Action, Trigger


class TestTagEnum(unittest.TestCase):
    def test_tag_enum_values(self):
        # Test for specific expected enum values
        self.assertEqual(Tag.IMPORTANT.value, ("default", "important"))

    def test_tag_enum_name_property(self):
        # Test the name property
        self.assertEqual(Tag.IMPORTANT.name, "default")


class TestAppEnum(unittest.TestCase):
    def test_app_enum_values(self):
        # Test for specific expected enum values
        self.assertTrue(App.GITHUB.value, "github")

    def test_app_enum_is_local_property(self):
        # Test the is_local property
        self.assertFalse(App.GITHUB.is_local)
        self.assertTrue(App.LOCALWORKSPACE.is_local)


class TestActionEnum(unittest.TestCase):
    def test_action_enum_values(self):
        # Test for specific expected enum values
        self.assertEqual(Action.GITHUB_ACTIONS_GET_SELF_HOSTED_RUNNER_FOR_ORG.value,
                         ("github", "github_actions_get_self_hosted_runner_for_org", False))

    def test_action_enum_properties(self):
        # Test properties
        self.assertEqual(Action.GITHUB_ISSUES_LIST.app, "github")
        self.assertEqual(Action.GITHUB_ISSUES_LIST.action, "github_issues_list")
        self.assertFalse(Action.GITHUB_ISSUES_LIST.no_auth)


class TestTriggerEnum(unittest.TestCase):
    def test_trigger_enum_values(self):
        # Test for specific expected enum values
        self.assertEqual(Trigger.SLACK_NEW_MESSAGE.value, ("slack", "slack_receive_message"))

    def test_trigger_enum_properties(self):
        # Test properties
        self.assertEqual(Trigger.SLACK_THREAD_REPLY.app, "slack")
        self.assertEqual(Trigger.SLACK_THREAD_REPLY.event, "slack_receive_thread_reply")


if __name__ == '__main__':
    unittest.main()
