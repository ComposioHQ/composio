---
type: "reference"
title: "Databricks"
description: "Public support knowledge for Databricks."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "databricks"
---
# Databricks


## Databricks OAuth client and secret setup reference

For Databricks OAuth client and secret setup, follow the [official Databricks OAuth application guide](https://docs.databricks.com/aws/en/agents/mcp/connect-clients). An account administrator creates the OAuth application, configures its redirect URL and scopes, and securely records the generated client ID and client secret.

## Enter Databricks API key credentials during connected account linking

The Databricks API key credentials are entered during the connection flow. In code, point customers to `composio.connected_accounts.link()` for creating the connected account and entering the API key details.
