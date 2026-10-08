---
type: "reference"
title: "PostHog"
description: "Public support knowledge for PostHog."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "posthog"
---
# PostHog


## PostHog is API-key based; use the PostHog API key when creating the connection

PostHog is API-key based in Composio. Use the customer's PostHog API key when creating the connection. For connected-account creation, pass the key in the API-key auth state, for example with `generic_api_key` or the required field name returned by toolkit metadata.

## Configure PostHog subdomain for EU or self-hosted instances

For EU or self-hosted PostHog instances, configure the PostHog `subdomain` or instance value instead of assuming the default cloud host. Inspect the current auth-config and connection-initiation fields to confirm where the active toolkit accepts that value.

## Pass auth config into Tool Router sessions; platform-created auth configs are not automatically usable

When using PostHog through Tool Router MCP, include the auth config in the Tool Router session so the generated MCP URL has the correct auth config details. Auth configs or connected accounts created on the platform side are not automatically available inside every Tool Router session unless they are passed/associated correctly.

## Create a PostHog integration/auth config before expecting it in auth_configs API results

`/api/v3/auth_configs` lists the active auth configs/integrations already created in the project. If PostHog is missing or the response is empty, create a PostHog auth config/integration first, then connect the account to it.

## Fetch PostHog tool schema to see required fields for a tool call

If a PostHog tool call fails because of missing or mixed-up parameters, fetch the tool schema by slug, for example `/api/v3/tools/POSTHOG_CREATE_PROJECT_INSIGHTS_WITH_FORMAT_OPTION`, using the project API key. The schema response shows the required fields and expected shapes for that tool call.
