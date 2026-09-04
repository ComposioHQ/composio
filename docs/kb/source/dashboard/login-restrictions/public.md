---
type: "guide"
title: "Dashboard MFA Setup"
description: "Public guidance for completing dashboard MFA setup."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "login-restrictions"
---
# Dashboard MFA Setup

Use this when a user cannot complete authenticator-app enrollment from the QR
code in Account Settings.

## Use the manual setup key when QR scanning does not complete

The MFA setup screen shows a QR code and a **View setup key** option. If the QR
code cannot be scanned or the setup screen expires, open **View setup key** and
enter that key manually in the authenticator app. Then enter the resulting
six-digit passcode in Composio to finish enrollment.

After enrollment is complete, resetting the setup key requires removing or
resetting the MFA factor and enrolling the authenticator again.
