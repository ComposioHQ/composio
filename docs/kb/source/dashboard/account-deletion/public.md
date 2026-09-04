---
type: "guide"
title: "Delete a Composio organization"
description: "Current self-service path and safety checks for organization deletion."
category: "account-and-billing"
visibility: "public"
timestamp: "2026-08-17T00:00:00Z"
tags:
  - "dashboard"
  - "account-deletion"
---
# Delete a Composio organization

## Organization admins can use Delete this organization

In Platform, open **Settings → Organization Settings → General**. In For You,
open **Settings → General**. Under **Delete this organization**, select **Delete
organization** and complete the confirmation shown by the dashboard.

The control is disabled for non-admins. A non-admin should contact an
organization admin. The current warning states that deletion permanently
removes the organization, its projects, connected accounts, API keys, and logs,
so confirm the organization before proceeding.

If upstream provider credentials also need to be invalidated, revoke the
connected accounts where supported and remove the app or rotate the credential
in the provider's own settings when necessary. Do not ask the customer to send
credentials to support.
