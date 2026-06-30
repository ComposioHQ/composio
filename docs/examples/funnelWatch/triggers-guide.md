---
title: Events
description: Understand how Composio delivers event data from connected apps
keywords: [triggers, webhooks, events, polling, webhook endpoint, concepts]
---

Events let your agent subscribe to updates in your connected apps: a new Slack message, a GitHub commit, an incoming email. The apps send their updates to Composio, which forwards them to your project's target URL.

You can get updates via webhooks (live-time updates) or by polling the provider at an interval(every 15 minutes).

** !! same process for polling?

<Figure src="/images/triggers-flow.svg" srcDark="/images/triggers-flow-dark.svg" alt="Triggers flow: connected apps send events to Composio, which delivers them to your webhook subscription URL via HTTP POST" caption="How triggers deliver events from apps to your application" />


## Working with triggers

1. Give Composio your endpoint
2. available events (e.g., `GITHUB_COMMIT_EVENT`).
3. **Create** an active trigger scoped to a user's connected account — see [Creating triggers](/docs/setting-up-triggers/creating-triggers), which also covers [Configuring the webhook endpoint](/docs/setting-up-triggers/creating-triggers#configuring-the-webhook-endpoint) for triggers that need it.
4. **Receive events** at your subscription URL and route on `metadata.trigger_slug`.
5. **Manage** triggers — enable, disable, or delete as needed.

