from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from email_support_agent.utils.nodes import (
    classify_intent_node,
    draft_reply_node,
    fetch_context_node,
    review_pending_node,
    trust_check_node,
)
from email_support_agent.utils.notion import (
    claim_notion_message_node,
    prepare_notion_row_node,
    write_notion_row_node,
)
from email_support_agent.utils.state import EmailSupportState, GraphRunResult, extract_email_facts


def build_graph():
    """Build the email support LangGraph."""
    workflow = StateGraph(EmailSupportState)
    workflow.add_node("fetch_context", fetch_context_node)
    workflow.add_node("trust_check", trust_check_node)
    workflow.add_node("classify_intent", classify_intent_node)
    workflow.add_node("claim_message", claim_notion_message_node)
    workflow.add_node("draft_reply", draft_reply_node)
    workflow.add_node("review_pending", review_pending_node)
    workflow.add_node("prepare_notion_row", prepare_notion_row_node)
    workflow.add_node("write_notion_row", write_notion_row_node)
    workflow.add_edge(START, "fetch_context")
    workflow.add_edge("fetch_context", "trust_check")
    workflow.add_edge("trust_check", "classify_intent")
    workflow.add_edge("classify_intent", "claim_message")
    workflow.add_edge("claim_message", "draft_reply")
    workflow.add_edge("draft_reply", "review_pending")
    workflow.add_edge("review_pending", "prepare_notion_row")
    workflow.add_edge("prepare_notion_row", "write_notion_row")
    workflow.add_edge("write_notion_row", END)
    return workflow.compile()


graph = build_graph()


def run_email_support_graph(initial_state: EmailSupportState) -> GraphRunResult:
    """Run the compiled email support graph and return a compact result."""
    final_state = graph.invoke(initial_state)
    facts = extract_email_facts(final_state)
    return GraphRunResult(
        decision=str(final_state.get("decision") or ""),
        intent=str(final_state.get("intent") or ""),
        reasons=list(final_state.get("reasons") or []),
        message_id=facts.message_id,
        thread_id=facts.thread_id,
        subject=facts.subject,
        sender=facts.sender,
        draft_body=final_state.get("draft_body"),
        draft_result=final_state.get("draft_result"),
        notion_row_payload=final_state.get("notion_row_payload"),
        notion_row=final_state.get("notion_row"),
        dry_run=bool(final_state.get("dry_run")),
        final_state=dict(final_state),
    )
