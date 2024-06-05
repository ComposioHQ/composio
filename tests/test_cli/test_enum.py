import unittest
from composio.client.enums import Tag, App, Action, Trigger


class TestTagEnum(unittest.TestCase):
    def test_tag_enum_values(self):
        # Test for specific expected enum values
        self.assertEqual(Tag.IMPORTANT.value, ("default", "important"))
        self.assertEqual(Tag.ASANA_GOAL_RELATIONSHIPS.value, ("asana", "Goal relationships"))
        self.assertEqual(Tag.ATTIO_LISTS.value, ("attio", "Lists"))
        self.assertEqual(Tag.BREVO_TASKS.value, ("brevo", "Tasks"))
        self.assertEqual(Tag.CLICKUP_TASKS.value, ("clickup", "Tasks"))

    def test_tag_enum_name_property(self):
        # Test the name property
        self.assertEqual(Tag.IMPORTANT.name, "default")

    def test_tag_enum_names(self):
        """Test the names of the Tag enum."""
        self.assertEqual(Tag.IMPORTANT.name, "default")
        self.assertEqual(Tag.ASANA_GOAL_RELATIONSHIPS.name, "asana")
        self.assertEqual(Tag.ATTIO_LISTS.name, "attio")
        self.assertEqual(Tag.BREVO_TASKS.name, "brevo")
        self.assertEqual(Tag.CLICKUP_TASKS.name, "clickup")

    def test_tag_enum_contains(self):
        """Test if specific tags are in the enum."""
        self.assertTrue(Tag.IMPORTANT in Tag)
        self.assertTrue(Tag.ASANA_BATCH_API in Tag)
        self.assertTrue(Tag.BREVO_EMAIL_CAMPAIGNS in Tag)
        self.assertTrue(Tag.CLICKUP_USERS in Tag)


class TestAppEnum(unittest.TestCase):
    def test_app_enum_values(self):
        # Test for specific expected enum values
        self.assertEqual(App.GITHUB.value, "github")

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
