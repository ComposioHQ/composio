from __future__ import annotations

import os
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from email_support_agent.utils.state import EmailFacts, sender_first_name
from email_support_agent.utils.workflow import load_workflow_config


DEFAULT_MODEL = "gpt-5.5"


def draft_support_reply(facts: EmailFacts) -> str:
    """Create a deterministic fallback support draft."""
    workflow = load_workflow_config()
    signature = _workflow_signature(workflow.markdown)
    greeting = f"Hi {sender_first_name(facts.sender)}," if sender_first_name(facts.sender) else "Hi,"

    return (
        f"{greeting}\n\n"
        "Thanks for reaching out. I can help look into this.\n\n"
        "Could you send the exact error, the steps you tried, and any relevant IDs or screenshots "
        "that are safe to share? Once I have that, I can point you to the right next step or route "
        "this to the team.\n\n"
        "Best,\n"
        f"{signature}"
    )


def draft_support_reply_with_llm(facts: EmailFacts) -> str:
    """Create an LLM-written support draft from the selected workflow Markdown."""
    workflow = load_workflow_config()
    signature = _workflow_signature(workflow.markdown)
    system = SystemMessage(
        content=(
            f"Write as {signature}. Create a concise support draft for human review. "
            "Use only the selected workflow Markdown as the source of truth. "
            "Do not promise refunds, security changes, account changes, or unsupported fixes. "
            "If the workflow does not contain the answer, ask for the missing diagnostic details. "
            f"End with Best, {signature}."
        )
    )
    human = HumanMessage(
        content=(
            f"Workflow file: {workflow.path}\n"
            f"Workflow instructions:\n{workflow.markdown}\n\n"
            f"Incoming subject: {facts.subject}\n"
            f"Incoming sender: {facts.sender}\n"
            f"Incoming body:\n{facts.body}\n"
        )
    )
    response = ChatOpenAI(model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL), temperature=0, timeout=120).invoke(
        [system, human]
    )
    content = _clean_draft_body(str(response.content))
    return content or draft_support_reply(facts)


def _workflow_signature(markdown: str, *, default: str = "Support Team") -> str:
    match = re.search(r"(?im)^Sign replies as:\s*(.+?)\s*$", markdown)
    if not match:
        return default
    value = match.group(1).strip()
    return value if value and "<TODO:" not in value else default


def _clean_draft_body(content: str) -> str:
    without_comments = re.sub(r"<!--.*?-->", "", content, flags=re.DOTALL)
    return "\n".join(line.rstrip() for line in without_comments.splitlines()).strip()
