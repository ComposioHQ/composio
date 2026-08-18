---
type: "troubleshooting"
title: "Google Tasks"
description: "Public OAuth, connection, and quota troubleshooting for Google Tasks."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-24T00:00:00Z"
tags:
  - "googletasks"
  - "oauth"
  - "scopes"
  - "quotas"
---
# Google Tasks

## Set up custom Google OAuth credentials

For a step-by-step guide to creating and configuring Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Resolve an "App is blocked" connection error

This error usually means the OAuth client is requesting scopes that Google has not verified for that client. Remove additional scopes beyond the defaults, or use a custom OAuth app and submit the scopes for verification.

## Enable the Google Tasks API for custom OAuth

When using custom credentials, enable the Google Tasks API in the Google Cloud project that owns the credentials. After enabling it under **APIs & Services**, wait a few minutes and retry.

## Resolve `Error 400: invalid_scope`

Verify the requested scopes and their formatting against the [Google OAuth scopes documentation](https://developers.google.com/identity/protocols/oauth2).

## Configure the consent-screen name on the customer-owned OAuth app

Google Tasks currently uses customer-owned OAuth credentials. Configure the app
name and branding in the Google Cloud project that owns those credentials, and
use the redirect URL shown by Composio's current auth-config flow.

## Resolve 401 errors on tool calls

A 401 usually means the access token is no longer valid. Re-authenticate the connected account and retry.
