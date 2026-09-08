---
type: "reference"
title: "OpenAI"
description: "Public support knowledge for OpenAI."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "openai"
---
# OpenAI


## `OPENAI_CREATE_IMAGE` supports `gpt-image-2` in the latest toolkit version

`gpt-image-2` has been shipped and can be used through `OPENAI_CREATE_IMAGE` on the latest toolkit version. If the model is missing, have the customer update the toolkit/tool version before retrying.

## Use `OpenAIAgentsProvider` when wiring Composio tools into OpenAI Agents

For OpenAI Agents, initialize Composio with `OpenAIAgentsProvider`, create a session for the user, fetch tools from the session, and pass those tools into the OpenAI Agent. This is the expected provider path when using the OpenAI Agents SDK with Composio.

## Pin auth config and connected account IDs in Tool Router sessions when a specific connection must be used

When creating a Tool Router session, pass the desired `authConfigId` and `connectedAccountId` in the session creation options. Use `authConfigs: { [toolkitSlug]: authConfigId }` and `connectedAccounts: { [toolkitSlug]: connectedAccountId }` so the session uses that specific connection instead of relying on discovery/default selection.

## Use `beforeExecute` modifiers to add a human approval layer before tool execution

Composio SDK modifiers can be used to add a gating layer before tool execution. Implement a `beforeExecute` modifier to inspect the tool call, request approval, and only allow the execution to continue when the customer's approval logic passes.

## Provider/schema compatibility errors often require upgrading Composio SDK packages together

When debugging provider/schema errors with OpenAI or LangChain-style integrations, upgrade both the core Composio package and the relevant provider package to their latest compatible versions before retesting.
