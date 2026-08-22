---
type: "troubleshooting"
title: "Kommo"
description: "Public authentication and subdomain troubleshooting for Kommo."
category: "authentication"
visibility: "public"
timestamp: "2026-07-24T00:00:00Z"
tags:
  - "kommo"
  - "oauth"
  - "subdomain"
---
# Kommo

## Enter only the Kommo account subdomain

The **Subdomain** field should contain only the part before `.kommo.com` in the account URL. For `https://yourcompany.kommo.com`, enter `yourcompany`, not an email domain or a value containing `.com` or dots.

If a failed connection already exists, delete it, reconnect, and enter the corrected subdomain.
