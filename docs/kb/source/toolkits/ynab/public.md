---
type: "guide"
title: "YNAB authentication"
description: "Current customer-owned OAuth setup for the YNAB toolkit."
category: "auth-config"
visibility: "public"
timestamp: "2026-08-17T00:00:00Z"
tags:
  - "ynab"
---
# YNAB authentication

## YNAB uses a customer-owned OAuth app

The current `ynab` toolkit supports OAuth2 and requires a YNAB application's
client ID and client secret. Create the app under YNAB's developer settings,
register the exact redirect URI shown by the current Composio auth-config flow,
and connect through that custom config.

If YNAB reports that an application is restricted, review the YNAB app's
current review and access-token restrictions. An app intended only for its
owner and an app distributed to unrelated users can have different provider
review requirements. Do not promise a provider approval date.
