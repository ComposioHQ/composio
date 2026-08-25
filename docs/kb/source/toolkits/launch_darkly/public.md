---
type: "reference"
title: "LaunchDarkly"
description: "Public support knowledge for LaunchDarkly."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "launch_darkly"
---
# LaunchDarkly

## LaunchDarkly currently uses a REST API access token

LaunchDarkly in Composio currently uses a LaunchDarkly REST API access token.

## OAuth client actions operate after toolkit authentication

The LaunchDarkly toolkit includes actions such as `Create OAuth 2.0 Client`. These call LaunchDarkly endpoints like `POST /oauth/clients` after the toolkit is already authenticated with an API access token.

Use this distinction when replying to customers:

- The action can create or manage a LaunchDarkly OAuth client inside LaunchDarkly.

- The current toolkit connection still uses the LaunchDarkly REST API access
  token described above.
