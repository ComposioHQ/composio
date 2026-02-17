## Why is Monday.com OAuth2 not working for my users?

Monday.com requires a workspace admin to install the OAuth2 app before any user in that workspace can authorize their account. If the app is not installed, users will see an authorization error when trying to connect.

## How do I install the Composio OAuth2 app for Monday.com?

A workspace admin needs to visit the following URL and approve the app installation:

`https://auth.monday.com/oauth2/authorize?client_id=96b038435fc029e045f9ba800e66fefa&response_type=install`

Once the admin has installed the app, users in that workspace can authorize their accounts using OAuth2 as usual.

## Do I need to install the app for each user?

No. The admin only needs to install the app once per workspace. After that, any user in the workspace can connect their Monday.com account through Composio's OAuth2 flow.

## How do I set up custom OAuth credentials for Monday.com?

For a step-by-step guide on creating and configuring your own Monday.com OAuth credentials with Composio, see [How to create OAuth2 credentials for Monday](https://composio.dev/auth/monday).
