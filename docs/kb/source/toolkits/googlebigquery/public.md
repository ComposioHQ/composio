---
type: "guide"
title: "Google BigQuery"
description: "Current authentication guidance for the Google BigQuery toolkit."
category: "auth-config"
visibility: "public"
timestamp: "2026-08-17T00:00:00Z"
tags:
  - "googlebigquery"
  - "oauth"
---
# Google BigQuery

## BigQuery supports managed OAuth2, custom OAuth2, and service-account auth

Use Composio-managed OAuth for the standard connection flow. Use a custom Google
OAuth app when the customer needs control over scopes, consent-screen branding,
or Google Cloud project policy. Service-account authentication is also available;
grant the service account only the BigQuery permissions required by the intended
tools.

If Google blocks an OAuth consent flow, check the OAuth app's verification,
test-user, organizational-policy, and requested-scope settings before treating
the failure as a Composio incident. Generate a fresh auth link after correcting
the Google Cloud configuration.
