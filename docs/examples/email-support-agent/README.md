# Email Support Workflow with Composio, Gmail, LangGraph, Notion, and LangSmith

Build a bounded email support workflow that drafts replies from a connected Gmail inbox.

When a new email arrives, Composio notifies this app, the LangGraph workflow checks the message against your support rules, and Gmail gets a draft reply for a human to review. The workflow never sends email.

The part you personalize is [workflows/support_email.md](workflows/support_email.md). Add your company context, support policy, FAQ, escalation rules, and draft examples there before using this with a real inbox.

![Email support agent architecture](assets/email-support-agent-architecture.png)

## What You Need

Required:

1. [Python 3.11+](https://www.python.org/downloads/)
2. [uv](https://docs.astral.sh/uv/)
3. [Composio API key](https://dashboard.composio.dev/)
4. [OpenAI API key](https://platform.openai.com/)
5. A Gmail account you can connect through Composio
6. A Notion account you can connect through Composio
7. A [LangSmith](https://docs.langchain.com/langsmith/observability-quickstart) account and API key
8. [ngrok](https://ngrok.com/) for a public local webhook URL

This example uses the Composio Python SDK. It does not use the Composio CLI.

## Run Locally

### 1. Install dependencies

```bash
uv sync
```

### 2. Create your local environment file

```bash
cp .env.example .env
```

Set these values in `.env`:

```text
COMPOSIO_API_KEY=
OPENAI_API_KEY=
LANGSMITH_API_KEY=
COMPOSIO_USER_ID=email_support_user
```

`COMPOSIO_USER_ID` is the stable demo user. Composio uses it to scope the connected Gmail account and all tool calls.

### 3. Start the app

```bash
uv run --env-file .env uvicorn email_support_agent.app:app --reload --port 8000
```

Leave this running.

### 4. Expose the local webhook endpoint

In another terminal:

```bash
ngrok http 8000
```

Copy the HTTPS URL and add `/webhook/composio` to it:

```text
https://YOUR-NGROK.ngrok-free.app/webhook/composio
```

### 5. Set up Composio

In a third terminal:

```bash
uv run --env-file .env python scripts/setup_composio.py \
  https://YOUR-NGROK.ngrok-free.app/webhook/composio \
  --setup-langsmith
```

The setup script will:

- create or reuse the Gmail connection for `COMPOSIO_USER_ID`
- print a Gmail Connect Link
- wait while you finish Gmail OAuth in the browser
- create the Composio webhook subscription
- save `COMPOSIO_WEBHOOK_SECRET` to `.env`
- create the `GMAIL_NEW_GMAIL_MESSAGE` trigger
- save `COMPOSIO_GMAIL_TRIGGER_ID` to `.env`
- create or reuse the Notion connection for `COMPOSIO_USER_ID`
- create an `Email Support Agent` Notion page
- create an `Email Support Inbox` Notion database under that page
- insert a smoke-test row
- save `NOTION_PAGE_ID`, `NOTION_DATABASE_ID`, and `NOTION_LOG_ROWS=true` to `.env`
- with `--setup-langsmith`: create or reuse the LangSmith project
- with `--setup-langsmith`: save `LANGSMITH_TRACING=true` and `LANGSMITH_PROJECT` to `.env`

The script opens Gmail and Notion Connect Links automatically when either toolkit still needs authorization.

Use `--langsmith-project your-project-name` if you want a different trace project name.

After setup, the Composio Triggers page should show an active Gmail trigger and recent webhook deliveries:

![Active Gmail trigger in Composio](assets/composio-gmail-trigger-events.png)

### 6. Try it

Send an email to the connected Gmail inbox. Composio delivers the trigger event to the FastAPI webhook, LangGraph runs the support workflow, and Gmail gets a draft reply for review.

Gmail triggers are polling-based. With Composio-managed auth, expect delivery in about 1-2 minutes.

Composio may deliver the same Gmail trigger payload more than once. The workflow claims each message in Notion before drafting, so redelivered events are skipped instead of producing duplicate drafts. This Notion claim is best-effort: Notion has no atomic upsert, so two perfectly concurrent deliveries of the same message could still both draft. Gmail polling triggers redeliver sequentially, so this is rare in practice; for a hard guarantee, back the claim with a store that supports unique keys. The webhook also ignores Gmail trigger payloads labeled `DRAFT`, because creating the Gmail draft can produce its own Gmail event.

## Personalize The Support Rules

Open [workflows/support_email.md](workflows/support_email.md) and replace the example company details with your own:

- what your product does
- what the workflow is allowed to answer
- what must be escalated to a human
- approved troubleshooting steps
- FAQ answers
- examples of good drafts and no-draft decisions

The LLM draft step treats that Markdown file as the source of truth. If the workflow file does not contain the answer, the draft should ask for safe diagnostic details or avoid drafting.

## What To Understand About Composio

- **User ID**: your app's stable identifier for a connected user. This example uses `email_support_user`.
- **Toolkit**: an app integration, such as `gmail` or `notion`.
- **Connected account**: the authenticated Gmail or Notion account attached to a user ID.
- **Session**: the scoped Composio object the workflow uses to access tools for one user.
- **Tool**: a concrete action, such as `GMAIL_FETCH_EMAILS` or `GMAIL_CREATE_EMAIL_DRAFT`.
- **Trigger**: the event source. Here it is `GMAIL_NEW_GMAIL_MESSAGE`.
- **Webhook subscription**: the public URL where Composio sends trigger events.
- **Webhook secret**: the secret used to verify that incoming events came from Composio.

Composio has two separate setup pieces:

- the **webhook subscription** is project-level and tells Composio where to POST events
- the **Gmail trigger** is user-level and watches one connected Gmail account for new messages

That is why the setup script creates both.

The setup script uses Composio's Webhook Subscriptions API to create the project-level webhook URL:

```http
POST https://backend.composio.dev/api/v3.1/webhook_subscriptions
```

Useful Composio docs:

- [Create webhook subscription](https://docs.composio.dev/reference/api-reference/webhook-subscriptions/postWebhookSubscriptions)
- [Subscribing to events](https://docs.composio.dev/docs/setting-up-triggers/subscribing-to-events)
- [Verifying webhooks](https://docs.composio.dev/docs/webhook-verification)
- [Triggers](https://docs.composio.dev/docs/triggers)

## Where The Composio Code Is

- `scripts/setup_composio.py`: connects Gmail and Notion, creates the webhook subscription, creates the Gmail trigger, creates the Notion logging database, and enables LangSmith tracing.
- `email_support_agent/webhook.py`: verifies Composio webhook signatures and routes trigger events.
- `email_support_agent/utils/tools.py`: creates scoped Composio Gmail and Notion sessions.
- `email_support_agent/utils/gmail.py`: fetches the triggering Gmail message and creates draft replies.
- `email_support_agent/utils/notion.py`: claims, writes, and updates Notion tracking rows.

The Gmail session is intentionally scoped:

```python
SAFE_GMAIL_TOOLS = [
    "GMAIL_FETCH_EMAILS",
    "GMAIL_CREATE_EMAIL_DRAFT",
]
```

`GMAIL_SEND_EMAIL` is not enabled.

By default, sessions expose [meta tools](https://docs.composio.dev/reference/meta-tools) that let an agent discover app tools at runtime. This example does not expose those discovery tools because the workflow already knows the exact Gmail and Notion tools it is allowed to use.

Instead, `email_support_agent/utils/tools.py` passes `preload={"tools": ...}` so `session.tools()` returns the small allowed set directly. Preloading is useful for frequently used tools because the workflow can call them without searching first, but keep the list small, generally fewer than 20 tools, to avoid context bloat. See [Configuring Sessions: Preloading tools](https://docs.composio.dev/docs/configuring-sessions#preloading-tools).

You can also restrict app permissions at the OAuth level. In the Composio Dashboard, create an Auth Config for Gmail or Notion with only the scopes this workflow needs. Programmatically, create an auth config with a `credentials.scopes` value, then pass that auth config into the session. Runtime tool filtering controls which Composio tools are available to the workflow; auth-config scopes control what the connected app account can authorize.

## Where LangGraph Is

- `email_support_agent/agent.py`: graph construction and exported `graph`.
- `email_support_agent/utils/nodes.py`: core graph nodes for trust checks, intent classification, and orchestration.
- `email_support_agent/utils/state.py`: graph state and webhook payload normalization.
- `email_support_agent/utils/drafting.py`: draft generation.

## Why LangGraph?

Use this pattern when you want a prescribed, inspectable process: fetch the triggering message, run deterministic checks, decide whether to draft, create a draft, and write the tracking row. LangGraph is a good fit here because each node has a clear job and the workflow should not invent new actions at runtime.

This is not the default pattern for open-ended agents. If you want an agent to discover tools, choose between many actions, or adapt its plan dynamically, start with Composio sessions and the tool router pattern instead. This example intentionally constrains the graph because support draft creation is a review workflow with narrow permissions.

`langgraph.json` exposes the compiled graph:

```json
{
  "dependencies": ["."],
  "graphs": {
    "email_support_agent": "./email_support_agent/agent.py:graph"
  },
  "env": ".env"
}
```

## Notion Logging

The setup script creates the page/database and turns Notion logging on for the demo:

```text
NOTION_LOG_ROWS=true
NOTION_DATABASE_ID=your_notion_database_id
```

Expected Notion properties:

```text
Date
Company
Priority
From
Draft Link
Why?
Message ID
```

Notion rows are used for tracking and duplicate protection. Gmail remains the human review surface.

## LangSmith Tracing

LangSmith shows each LangGraph node run, the input email, the draft decision, and any tool/runtime errors.

The setup script creates or reuses the project and enables tracing:

```text
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=email-support-agent
```

Unit tests disable tracing at import time so dry-run test graphs are not uploaded.

If you run tests manually and want to be extra explicit, set:

```text
LANGSMITH_TRACING=false
```

```bash
uv run --env-file .env python scripts/setup_composio.py \
  https://YOUR-NGROK.ngrok-free.app/webhook/composio \
  --setup-langsmith
```

With tracing enabled, LangSmith shows each graph run, input message, decision, and latency:

![LangSmith traces for the email support agent](assets/langsmith-email-support-traces.png)

## Project Shape

```text
email_support_agent/
  __init__.py
  agent.py
  app.py
  webhook.py
  utils/
    __init__.py
    tools.py
    nodes.py
    state.py
    gmail.py
    drafting.py
    notion.py
    workflow.py
scripts/
  setup_composio.py
  delete_webhook_subscription.py
langgraph.json
pyproject.toml
```

This mirrors the LangGraph docs pattern: `agent.py` constructs and exports the compiled `graph`, while helpers live under `utils`.

## Verify

```bash
uv run --env-file .env python -m unittest discover -s tests -p 'test_*.py'
```

The unit tests disable LangSmith tracing at import time, even if your local `.env` has tracing enabled. That keeps test runs from uploading dry-run graph traces.

## Troubleshooting

### I deleted my triggers, but setup still says a webhook subscription exists

That is expected. A Composio **trigger instance** and a Composio **webhook subscription** are different resources.

- A trigger instance watches one connected account for one event type, such as `GMAIL_NEW_GMAIL_MESSAGE` for `email_support_user`.
- A webhook subscription is the project-level URL where Composio delivers signed events, such as `https://YOUR-NGROK.ngrok-free.app/webhook/composio`.
- Multiple triggers can deliver events to the same webhook subscription.
- Deleting triggers does not delete the webhook subscription.

If local setup fails with a webhook subscription limit error, the project probably still has an old webhook subscription, often pointing at a previous ngrok or deployed URL. Either keep using that URL, delete the old subscription, or rerun setup with:

```bash
uv run --env-file .env python scripts/setup_composio.py \
  https://YOUR-NGROK.ngrok-free.app/webhook/composio \
  --replace-webhook
```

Use `--replace-webhook` only when you are sure the old project webhook URL is no longer needed.
