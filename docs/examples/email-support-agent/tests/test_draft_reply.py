from __future__ import annotations

import os
import unittest

from dotenv import load_dotenv

os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"

from email_support_agent.utils.drafting import draft_support_reply, draft_support_reply_with_llm
from email_support_agent.utils.state import EmailFacts


SAMPLE_SUPPORT_EMAIL = EmailFacts(
    subject="Webhook trigger is not creating drafts",
    sender="Taylor Reed <taylor@example.com>",
    to="support@example.com",
    body=(
        "Hi, I connected Gmail and created a trigger, but new messages are not creating drafts. "
        "How can I debug the webhook setup?"
    ),
    message_id="msg_support",
    thread_id="thread_support",
)


class DraftReplyTests(unittest.TestCase):
    def test_support_draft_without_running_graph(self) -> None:
        draft = draft_support_reply(SAMPLE_SUPPORT_EMAIL)

        self.assertIn("Hi Taylor,", draft)
        self.assertIn("Thanks for reaching out", draft)
        self.assertIn("exact error", draft)
        self.assertIn("steps you tried", draft)
        self.assertIn("Best,\nSupport Team", draft)
        self.assertNotIn("send email", draft.lower())

    @unittest.skipUnless(
        os.getenv("RUN_LLM_DRAFT_TEST", "").lower() in {"1", "true", "yes"},
        "Set RUN_LLM_DRAFT_TEST=true to preview the LLM draft body.",
    )
    def test_llm_support_draft_preview(self) -> None:
        load_dotenv(".env")
        draft = draft_support_reply_with_llm(SAMPLE_SUPPORT_EMAIL)

        self.assertNotIn("<!--", draft)
        self.assertNotIn("-->", draft)
        self.assertNotRegex(draft, r" +\n")

        print("\n--- LLM support draft preview ---")
        print(draft)


if __name__ == "__main__":
    unittest.main()
