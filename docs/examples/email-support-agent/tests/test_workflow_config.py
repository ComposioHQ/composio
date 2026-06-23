from __future__ import annotations

import unittest

from email_support_agent.utils.workflow import load_workflow_config, workflow_summary_for_state


class WorkflowConfigTests(unittest.TestCase):
    def test_default_workflow_is_markdown_source_of_truth(self) -> None:
        workflow = load_workflow_config()

        self.assertEqual(workflow.path, "workflows/support_email.md")
        self.assertIn("# Support Email Workflow", workflow.markdown)
        self.assertIn("## Company Context", workflow.markdown)
        self.assertEqual(
            workflow_summary_for_state(workflow.markdown),
            {"title": "Support Email Workflow", "has_todos": False},
        )


if __name__ == "__main__":
    unittest.main()
