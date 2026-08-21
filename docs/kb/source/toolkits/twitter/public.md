---
type: "reference"
title: "Twitter"
description: "Public support knowledge for Twitter."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "twitter"
---
# Twitter

## Twitter/X supports Composio-managed and customer-owned OAuth

Use the current managed OAuth flow for the standard connection. A customer-
owned X developer app remains appropriate when the customer needs control over
app settings, provider plan, scopes, or branding.


## Use Composio's v1 auth-app redirect URI for Twitter OAuth callback mismatch errors

For Twitter OAuth callback mismatch errors, configure the Twitter/X developer app with the exact callback shown by the current Composio auth-config flow. Do not use the legacy v1 callback from older support guidance.

## Twitter/X posts must stay within X's character counting rules

Twitter/X enforces strict post length limits. For normal posts, keep the content under 280 characters and follow X's official character-counting behavior, since URLs, Unicode, and special characters may be counted by provider-specific rules.

## `client-not-enrolled` and `App not linked to project` usually point to Twitter developer app/project setup issues

These errors usually mean the Twitter/X developer app is not correctly connected to a Twitter developer project, or the OAuth app configuration is stale after X's API model changes. Verify the app is linked to a project, configured according to the Twitter setup guide, and aligned with the current X API requirements. If the connected account is already `EXPIRED`, recreate the connection after fixing the app configuration.

## If X v2 API support appears missing, check for an older Twitter toolkit version

The current Twitter/X toolkit uses v2 endpoints. If a customer sees behavior that looks like older endpoints, check which toolkit version they are using and retry on the latest available version.

## Search and other app-only actions use the Application Bearer Token

Several X actions—including recent/full-archive search and counts, post lookup by IDs, post usage, label-stream, and compliance-job actions—use app-only authentication. They read the `Application Bearer Token` from the Twitter auth config, not the connected user's OAuth access token.

If user-token actions succeed but these actions return 401, verify that the bearer token comes from the same X Developer App as the OAuth client credentials and that the app's X API plan allows the endpoint. Adding user OAuth scopes does not repair an invalid app bearer token. Reconnect only when the user grant also needs to change.
