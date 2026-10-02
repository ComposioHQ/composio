## Why is Monday.com OAuth2 not working for my users?

Monday.com requires a workspace admin to install the OAuth2 app before any user in that workspace can authorize their account. If the app is not installed, users will see an authorization error when trying to connect.

## How do I install the Composio OAuth2 app for Monday.com?

A workspace admin must install the same Monday app used by the Composio auth config. Use the installation route provided for that app in the current connection flow. An older install link may point to a different app with different permissions.

If Monday says the app is private or does not offer an install option, contact Composio support with the auth config ID. The managed app must be available to the target Monday account before its users can authorize it. The admin should review the permissions shown by Monday before installing.

## Do I need to install the app for each user?

No. The admin only needs to install the app once per workspace. After that, any user in the workspace can connect their Monday.com account through Composio's OAuth2 flow.

## How do I set up custom OAuth credentials for Monday.com?

For a step-by-step guide on creating and configuring your own Monday.com OAuth credentials with Composio, see [How to create OAuth2 credentials for Monday](https://composio.dev/auth/monday).

## How do I configure scopes for Monday.com?

Monday.com doesn't accept scopes in the auth config the way Google does. Scopes are configured on the OAuth app itself. If you're using the default OAuth app, the required scopes are already configured. If creating your own app, add the scopes you need:

```bash
me:read
boards:read
boards:write
docs:read
docs:write
workspaces:read
workspaces:write
users:read
users:write
account:read
notifications:write
updates:read
updates:write
assets:read
tags:read
teams:read
teams:write
webhooks:write
webhooks:read
```

---
