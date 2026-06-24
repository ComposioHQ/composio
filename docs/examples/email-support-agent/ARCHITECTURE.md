# Architecture Notes

## Crucial Code

- `email_support_agent/agent.py`: graph construction and exported LangGraph `graph`.
- `email_support_agent/utils/state.py`: graph state, result types, and webhook payload normalization.
- `email_support_agent/utils/nodes.py`: LangGraph node functions and local safety helpers.
- `email_support_agent/utils/tools.py`: scoped Composio Gmail and Notion sessions.
- `email_support_agent/utils/gmail.py`: Gmail fetch and draft tool execution.
- `email_support_agent/webhook.py`: Composio webhook verification and routing.
- `email_support_agent/utils/notion.py`: Notion tracking, duplicate message claims, and Notion graph nodes.
- `scripts/setup_composio.py`: Gmail/Notion Connect Links, LangSmith project setup, webhook subscription, and `GMAIL_NEW_GMAIL_MESSAGE` trigger setup.

## Boundary

Composio owns external integration:

1. Connect Gmail and Notion accounts.
2. Create webhook subscriptions and Gmail triggers.
3. Execute scoped Gmail and Notion tools.

LangGraph owns orchestration:

1. Fetch email context.
2. Check trust and classify intent.
3. Create a Gmail draft for human review.
4. Write Notion tracking rows.

## Draft-Only Contract

The graph may call:

```python
GMAIL_FETCH_EMAILS
GMAIL_CREATE_EMAIL_DRAFT
```

It must not enable:

```python
GMAIL_SEND_EMAIL
GMAIL_SEND_DRAFT
```
