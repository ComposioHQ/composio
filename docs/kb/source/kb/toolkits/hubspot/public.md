---
type: reference
title: "HubSpot"
description: "Customer-safe support knowledge for HubSpot."
category: toolkits/hubspot
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - hubspot
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

## HubSpot managed OAuth app unverified warning has no reliable ETA; BYOA is the unblock path

- Search terms: HubSpot app unverified; HubSpot not reviewed or approved; Connecting an unverified app; Composio managed HubSpot OAuth app verification; HubSpot app review warning; HubSpot OAuth approval ETA

The Composio-managed HubSpot OAuth app is still under HubSpot verification.

If a customer sees HubSpot's unverified/not-reviewed warning on the managed app, do not promise a resolution date; the final approval timeline depends on HubSpot and there is no reliable ETA until HubSpot completes review.

The default managed HubSpot OAuth app is intended to make setup easy for customers getting started with Composio. Until HubSpot verifies it, the only practical unblock path for customers who cannot accept the warning is to use their own HubSpot OAuth app credentials in a custom Composio auth config. If they already have a HubSpot OAuth app, they can bring those credentials and control the app identity/verification posture shown during OAuth.

Customer-safe response shape:

```text
The HubSpot OAuth app verification is still in review, and we do not have an exact ETA yet since the final approval timeline depends on HubSpot. We are tracking it on our side and will update you once there is a concrete status.

In the meantime, if this warning blocks your users, the available workaround is to use your own HubSpot OAuth app credentials in a custom Composio auth config. That lets you control the OAuth app identity and verification posture while HubSpot reviews the Composio-managed app.
```

Link the customer to the HubSpot custom OAuth/BYOA guide (`https://composio.dev/auth/hubspot`) and remind them to use the Composio callback URL shown in the auth config, currently `https://backend.composio.dev/api/v3/toolkits/auth/callback`.

## HubSpot scopes must be predeclared in the HubSpot app config

HubSpot requires scopes to be declared in the app configuration before OAuth. The scope set on the Composio auth config should match the HubSpot app settings; HubSpot will not dynamically adjust scopes at connection time.

## HubSpot OAuth token-fetch 400: check client secret and required-scope alignment

First check the HubSpot OAuth client secret. Several reported customer-owned HubSpot OAuth failures were resolved by copying the correct current client secret from the HubSpot app and updating the Composio custom auth config to match. If the secret was rotated or copied from the wrong HubSpot app, HubSpot can fail token exchange with a 400.

Then check scope alignment. HubSpot is strict about required scopes:

- Required scopes configured on the HubSpot app must be present in the OAuth request/install URL `scope` parameter for successful installation.

- If the Composio auth config requests required scopes that do not match the customer-owned HubSpot app's configured required scopes, authorization/token exchange can fail.

- Optional scopes should be requested through HubSpot's `optional_scope` parameter. If the selected HubSpot account/user cannot grant an optional scope, HubSpot can omit it and the resulting token will not include that scope. Do not assume optional scopes were granted; inspect token/granted scopes before relying on optional capabilities.

For Composio-managed HubSpot auth configs, do not change the default scope set. If the customer needs a different required/optional scope configuration, they need to use their own HubSpot OAuth app through a custom Composio auth config.

Customer-safe response shape:

```text
This looks like the HubSpot OAuth callback is failing during token exchange. If you're using your own HubSpot OAuth app, please first confirm the client secret in your Composio auth config matches the current client secret in HubSpot.

Also make sure the required scopes in the Composio auth config match the required scopes configured on the HubSpot app. HubSpot treats required scopes strictly; optional scopes can be omitted if the account cannot grant them, so the app should check which optional scopes were actually granted.
```

## Some HubSpot scopes are not in Composio managed auth; use own OAuth app or wait for managed scope update

If a required HubSpot scope is not configured on Composio’s managed OAuth app, customers can use their own HubSpot OAuth app to unblock. For managed auth, Composio may need to add the scope to its OAuth app/default scope list before it can be requested.

## Old HubSpot SDK/toolkit versions use old double-prefixed slugs

Update the SDK and explicitly use the latest HubSpot toolkit version. Older versions used slugs like `HUBSPOT_HUBSPOT_LIST_CONTACTS`; newer versions use slugs like `HUBSPOT_LIST_CONTACTS`.

## HubSpot auth loops can be caused by HubSpot-side workspace/login state

If the HubSpot flow loops while Composio works on its side, retry while logged into the correct HubSpot workspace and confirm the OAuth app is public/configured correctly.

## Composio does not provide HubSpot field-level permissions; restrict by user/session/tools instead

Composio does not provide HubSpot field-level permissions inside a single tool call. Approximate this with user-scoped sessions, deciding which users connect HubSpot, and filtering allowed toolkits/tools per session, such as read-only tools for some users and update tools for others.

## HubSpot marketing campaign objects do not expose a properties API like CRM objects

For HubSpot marketing objects such as campaigns, HubSpot does not expose a properties API in the same way it does for CRM objects. Customers may need to inspect/configure these from the HubSpot portal.

## HubSpot triggers require each customer’s own app ID and developer API key

HubSpot webhook APIs need the specific HubSpot app that should receive webhook notifications. For customer HubSpot triggers, `app_id` and developer API key are required because each customer needs their own HubSpot app for webhook delivery.

## After HubSpot trigger fixes, recreate old triggers

When HubSpot trigger fixes go live, old trigger instances may need to be deleted and recreated so they pick up the new trigger behavior/configuration.

## Deleting a HubSpot connected account disconnects it and stops token refresh

Deleting the connected account disconnects the HubSpot account from Composio and stops refreshing that access token.
