---
type: "guide"
title: "DigitalOcean authentication"
description: "Current authentication choices for the DigitalOcean toolkit."
category: "auth-config"
visibility: "public"
timestamp: "2026-08-17T00:00:00Z"
tags:
  - "digital_ocean"
---
# DigitalOcean authentication

## DigitalOcean supports managed OAuth2, custom OAuth2, or a personal access token

The current `digital_ocean` toolkit supports OAuth2 and API-key authentication.
Use Composio-managed OAuth for the standard connection flow. Use a custom
DigitalOcean OAuth app when the customer needs control over provider settings;
register the exact callback URI shown by the current Composio flow.

For API-key authentication, provide a DigitalOcean Personal Access Token in the
`bearer_token` connection field. If OAuth fails before consent, compare the
authorization request with the customer-owned app registration and use the API
key path only when it matches the customer's security requirements.
