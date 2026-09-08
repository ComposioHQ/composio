---
type: "reference"
title: "HubSpot"
description: "Public support knowledge for HubSpot."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "hubspot"
---
# HubSpot

## Minimum HubSpot contact scopes are contact read/write

For HubSpot CRM contacts, the minimum scopes are `crm.objects.contacts.read` and `crm.objects.contacts.write`. Sensitive contact fields require the corresponding sensitive scopes such as `crm.objects.contacts.sensitive.read` and `.write`.

## Use Composio scopes API or HubSpot docs to find required HubSpot scopes

Use HubSpot’s own scopes documentation and Composio’s scopes/tools API to map actions to required scopes. This is better than guessing scopes manually.

## Create custom HubSpot tools through toolkit-authenticated API requests

You can create a custom tool that sends authenticated requests to HubSpot API endpoints; Composio handles authentication for the connected account. Alternatively, call the provider directly with connection config/custom headers if needed.

## HubSpot trigger setup needs the HubSpot app ID

For HubSpot webhook/trigger setup, get the app ID from HubSpot’s webhook app documentation / developer app settings and use it when configuring triggers.

## Use custom HubSpot credentials for white-label auth

Use your own HubSpot OAuth app credentials/custom auth config. That gives control over branding/consent and avoids relying on the Composio managed app for the customer-facing OAuth screen.

## HubSpot scopes must be predeclared in the HubSpot app config

HubSpot requires scopes to be declared in the app configuration before OAuth. The scope set on the Composio auth config should match the HubSpot app settings; HubSpot will not dynamically adjust scopes at connection time.

## HubSpot OAuth token-fetch 400: check client secret and required-scope alignment

First check the HubSpot OAuth client secret. Several reported customer-owned HubSpot OAuth failures were resolved by copying the correct current client secret from the HubSpot app and updating the Composio custom auth config to match. If the secret was rotated or copied from the wrong HubSpot app, HubSpot can fail token exchange with a 400.

Then check scope alignment. HubSpot is strict about required scopes:

- Required scopes configured on the HubSpot app must be present in the OAuth request/install URL `scope` parameter for successful installation.

- If the Composio auth config requests required scopes that do not match the customer-owned HubSpot app's configured required scopes, authorization/token exchange can fail.

- Optional scopes should be requested through HubSpot's `optional_scope` parameter. If the selected HubSpot account/user cannot grant an optional scope, HubSpot can omit it and the resulting token will not include that scope. Do not assume optional scopes were granted; inspect token/granted scopes before relying on optional capabilities.

For Composio-managed HubSpot auth configs, do not change the default scope set. If the customer needs a different required/optional scope configuration, they need to use their own HubSpot OAuth app through a custom Composio auth config.

Example response:

```text
This looks like the HubSpot OAuth callback is failing during token exchange. If you're using your own HubSpot OAuth app, please first confirm the client secret in your Composio auth config matches the current client secret in HubSpot.

Also make sure the required scopes in the Composio auth config match the required scopes configured on the HubSpot app. HubSpot treats required scopes strictly; optional scopes can be omitted if the account cannot grant them, so the app should check which optional scopes were actually granted.
```

## Old HubSpot SDK/toolkit versions use old double-prefixed slugs

Update the SDK and explicitly use the latest HubSpot toolkit version. Older versions used slugs like `HUBSPOT_HUBSPOT_LIST_CONTACTS`; newer versions use slugs like `HUBSPOT_LIST_CONTACTS`.

## HubSpot auth loops can be caused by HubSpot-side workspace/login state

If the HubSpot flow loops while Composio works on its side, retry while logged into the correct HubSpot workspace and confirm the OAuth app is public/configured correctly.

## HubSpot marketing campaign objects do not expose a properties API like CRM objects

For HubSpot marketing objects such as campaigns, HubSpot does not expose a properties API in the same way it does for CRM objects. Customers may need to inspect/configure these from the HubSpot portal.

## HubSpot triggers require each customer’s own app ID and developer API key

HubSpot webhook APIs need the specific HubSpot app that should receive webhook notifications. For customer HubSpot triggers, `app_id` and developer API key are required because each customer needs their own HubSpot app for webhook delivery.

## Deleting a HubSpot connected account disconnects it and stops token refresh

Deleting the connected account disconnects the HubSpot account from Composio and stops refreshing that access token.
