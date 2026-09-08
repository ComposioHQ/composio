---
type: "reference"
title: "Discord"
description: "Public support knowledge for Discord."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "discord"
---
# Discord


## Discord OAuth credentials do not have a fixed expiration period

Discord OAuth2 client credentials do not have a fixed expiration period. If a
customer-owned credential suddenly fails, it may have been manually revoked,
reset, or regenerated in Discord. Verify the current Discord developer-app
credentials and create a fresh connection before treating the failure as a
broader provider or Composio issue.
