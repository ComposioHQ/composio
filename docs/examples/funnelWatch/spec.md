# Growth Pulse Spec

## Product Summary

Growth Pulse is a read-only revenue and marketing intelligence agent. It collects business events through Composio triggers, stores raw and normalized data in a 24-hour session volume, runs analytics outside the agent's context, and sends internal recommendations and updates through a dashboard and Slackbot.

## Core Thesis

Triggers collect live business signals.

Volumes act as a temporary analytical workspace.

The agent explains what changed, why it matters, and what the team should look at next.

## Primary Use Case

A business wants to monitor revenue, campaigns, SKUs, leads, and anomalies throughout the day without manually checking Stripe, HubSpot, Mailchimp/Klaviyo, ads dashboards, and Slack.

Example default question:

> Tell me whether SKU A or SKU B is selling more today.

## System Scope

Growth Pulse can automatically:

- Collect trigger events
- Query read-only metrics
- Store raw and normalized data in the session volume
- Run analytics over volume data
- Generate recommendations
- Send internal Slack updates
- Show dashboard insights
- Generate hourly and daily reports
- Persist compact summaries to durable storage
- Let users configure custom monitoring questions

Growth Pulse must not support:

- Pausing or increasing ad budget
- Launching or modifying campaigns
- Sending customer emails
- Sending marketing emails
- Changing HubSpot/Salesforce lifecycle stages
- Assigning leads to reps
- Creating discounts or coupon codes
- Refunding payments
- Canceling subscriptions
- Changing pricing pages or public content
- Updating customer-visible docs
- Posting in external/customer Slack channels

## Architecture

```text
Composio triggers + read-only tool calls
        |
        v
Webhook/event receiver
        |
        v
24-hour session volume
  raw events
  normalized tables
  analytics outputs
        |
        v
Analytics runner
        |
        v
Agent reasoning layer
        |
        +--> Dashboard
        +--> Slackbot
        +--> Daily durable summary
```

## Session Model

Each session lasts up to 24 hours. The volume is not permanent memory. It is a temporary workspace for raw event data, CSVs, JSONL files, analytics outputs, and reports.

At the end of each session, Growth Pulse stores compact summaries in durable storage such as Supabase, Google Sheets, Notion, or the app database. The next session starts fresh but can load prior summaries.

## Suggested Integrations

MVP:

- Stripe: revenue, payments, refunds, failed payments, subscriptions
- HubSpot: leads, contacts, deals, campaigns
- Mailchimp or Klaviyo: email campaign engagement
- Slack: internal updates
- Google Sheets or Notion: durable reports

Optional later:

- Shopify
- Meta Ads
- Google Ads
- Google Analytics / PostHog / Amplitude
- Gmail
- Salesforce

## Volume Layout

```text
/growth-pulse/{session_date}/
  raw/
    stripe_events.jsonl
    hubspot_events.jsonl
    mailchimp_events.jsonl
    slack_events.jsonl
    ad_snapshots.jsonl

  normalized/
    revenue_events.jsonl
    sku_sales.jsonl
    campaign_events.jsonl
    lead_events.jsonl
    funnel_events.jsonl

  analytics/
    daily_metrics.json
    sku_comparison.json
    anomaly_report.md
    campaign_rankings.csv
    recommendations.md

  reports/
    hourly_digest.md
    daily_summary.md
```

## Default Monitors

- Revenue today vs yesterday
- Purchases by SKU
- SKU A vs SKU B comparison
- Failed payment rate
- Refund spikes
- Campaign spend vs revenue
- Top campaign by revenue
- Top lead source
- Lead volume vs purchase volume
- Conversion rate changes
- Email campaign engagement
- Unusual drop in purchases

## Custom Monitor Settings

Users can create plain-English monitors.

Examples:

```text
Tell me which SKU, A or B, people buy more.
Alert me if failed payments go above 5%.
Summarize revenue by channel every 2 hours.
Tell me if Campaign X gets leads but no purchases.
Compare Google Ads and Meta Ads revenue efficiency.
Watch whether enterprise leads convert better than SMB leads.
```

Each monitor should have:

- Name
- Question
- Data sources
- Frequency: real-time, hourly, daily
- Slack channel
- Optional threshold
- Enabled/disabled toggle

## Dashboard

Tabs:

- Overview: revenue, purchases, conversion, alerts
- SKU Watch: SKU A/B comparison, top products, refund rates
- Campaign Watch: spend, leads, revenue, estimated ROAS
- Event Feed: incoming trigger events
- Recommendations: agent-generated insights
- Reports: hourly and daily summaries
- Settings: default and custom monitors

## Slackbot

Slackbot sends internal-only updates.

Examples:

```text
SKU Update

SKU A is outselling SKU B today: 148 vs 91 purchases.
SKU A also has a lower refund rate: 1.2% vs 3.9%.
```

```text
Anomaly Alert

Failed payments crossed your 5% threshold.
Current rate: 7.4%.
Most affected SKU: Pro Annual.
```

```text
Recommendation

Campaign X is generating leads but weak revenue.
Leads: 84
Purchases: 3
Recommendation: review targeting and landing-page fit before increasing spend.
```

## MVP Demo Flow

1. User connects Stripe, HubSpot, Mailchimp/Klaviyo, Slack, and Sheets/Notion.
2. Growth Pulse starts a 24-hour session.
3. Triggers and read-only tool calls populate the volume.
4. Dashboard shows live events and metrics.
5. Default monitor compares SKU A vs SKU B.
6. User adds a custom monitor in Settings.
7. Analytics runner detects an anomaly.
8. Slackbot sends an internal recommendation.
9. Daily summary is saved to durable storage.

## Success Criteria

The demo should prove that Growth Pulse can:

- Continuously collect business events
- Use a session volume for analytics outside model context
- Generate useful recommendations from accumulated data
- Let users configure specific business questions
- Keep the system read-only and low-risk
- Send clear internal updates through Slack

## References

- [Composio triggers](https://docs.composio.dev/docs/triggers)
- [Composio toolkits](https://docs.composio.dev/toolkits)
- [Session file mounts](https://docs.composio.dev/reference/sdk-reference/typescript/tool-router-session-files-mount)
- [Stripe toolkit](https://docs.composio.dev/toolkits/stripe)
- [HubSpot toolkit](https://docs.composio.dev/toolkits/hubspot)
- [Mailchimp toolkit](https://docs.composio.dev/toolkits/mailchimp)

# stack
FastAPI
Composio Python SDK
Composio OpenAI Responses provider
OpenAI Responses API
Composio triggers/webhooks
Composio workbench/session volume
pandas / duckdb / polars for analytics
Slack toolkit for internal alerts
Simple dashboard


# best practices
Use Composio sessions as the unit of runtime context.
A session scopes user identity, connected accounts, available tools, auth, logs, workbench state, and files. Composio explicitly says to create sessions with composio.create(user_id=...), and to reuse composio.use(session_id) for multi-turn workflows rather than creating new sessions every request. Source: What is a session?

Use native tools, not MCP, for this Python app.
Composio says native tools give you more control over tool schemas, logging, retries, approvals, and context cost. MCP is better when you need to plug into an MCP-compatible client. Since Growth Pulse is your own Python backend, native tools are the better fit. Source: Native Tools vs MCP

Use OpenAI Responses API as the default OpenAI path.
Composio’s OpenAI provider docs say the Responses API is the recommended way to build agentic flows with OpenAI, and the OpenAI provider is the default provider for the SDK. Source: Composio OpenAI provider

Use triggers via webhooks for event ingestion.
For production-style trigger handling, Composio’s trigger flow is: subscribe your project webhook URL, create trigger instances scoped to connected accounts, receive structured payloads, route by metadata.trigger_slug. Source: Triggers

Use workbench/volume for bulk analytics.
Composio positions the workbench for large responses, data transformations, bulk operations, and analytics with Python libraries like pandas and numpy. That maps exactly to Growth Pulse’s 24-hour analytical workspace. Source: Workbench