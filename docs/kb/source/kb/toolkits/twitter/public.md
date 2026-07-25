---
type: reference
title: "Twitter"
description: "Customer-safe support knowledge for Twitter."
category: toolkits/twitter
visibility: public
timestamp: 2026-07-16T00:00:00Z
tags:
  - twitter
---
# Twitter


## Twitter/X no longer supports Composio managed OAuth; customers must use their own developer app credentials

Composio removed support for the managed/default Twitter OAuth app after X/Twitter suspended the app and moved to its newer pay-per-use API model. For Twitter/X, customers should create their own Twitter developer app and configure a custom authConfig with their own credentials. The Twitter setup guide should be used to verify app settings, callback/redirect URLs, scopes, and project linkage before retrying the connection.

## Twitter/X cannot be used through Connect when it requires custom OAuth credentials

Connect does not support custom OAuth credentials. Since Twitter/X requires customer-owned developer credentials after managed OAuth support was removed, Twitter integrations that need those credentials must be set up from the main Composio Platform with a custom authConfig. The consumer Connect flow is not the right surface for Twitter when BYOC/custom OAuth is required.

## Use Composio's v1 auth-app redirect URI for Twitter OAuth callback mismatch errors

For Twitter OAuth callback mismatch errors, try configuring `https://backend.composio.dev/api/v1/auth-apps/add` as the redirect URI in the Twitter/X developer app. Composio's v1 URI can be used by default in this flow, so the provider-side callback URL must match it exactly.

## Twitter/X posts must stay within X's character counting rules

Twitter/X enforces strict post length limits. For normal posts, keep the content under 280 characters and follow X's official character-counting behavior, since URLs, Unicode, and special characters may be counted by provider-specific rules.

## `client-not-enrolled` and `App not linked to project` usually point to Twitter developer app/project setup issues

These errors usually mean the Twitter/X developer app is not correctly connected to a Twitter developer project, or the OAuth app configuration is stale after X's API model changes. Verify the app is linked to a project, configured according to the Twitter setup guide, and aligned with the current X API requirements. If the connected account is already `EXPIRED`, recreate the connection after fixing the app configuration.

## If X v2 API support appears missing, check for an older Twitter toolkit version

The current Twitter/X toolkit uses v2 endpoints. If a customer sees behavior that looks like older endpoints, check which toolkit version they are using and retry on the latest available version.

## Twitter token invalidation incidents can appear as expired connected accounts after skipped refresh attempts

Some Twitter connected accounts can appear expired or fail during tool calls when refresh attempts are skipped. After the refresh issue is resolved, ask the customer to retry tool calls and check for remaining execution errors.

## Search and other app-only actions use the Application Bearer Token

Several X actions—including recent/full-archive search and counts, post lookup by IDs, post usage, label-stream, and compliance-job actions—use app-only authentication. They read the `Application Bearer Token` from the Twitter auth config, not the connected user's OAuth access token.

If user-token actions succeed but these actions return 401, verify that the bearer token comes from the same X Developer App as the OAuth client credentials and that the app's X API plan allows the endpoint. Adding user OAuth scopes does not repair an invalid app bearer token. Reconnect only when the user grant also needs to change.
