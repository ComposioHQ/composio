## How do I set up custom Google OAuth credentials for YouTube?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting quota errors on YouTube?

YouTube enforces strict API quotas. If you use the managed/default OAuth app, that quota can be shared across users, so production workloads can hit provider quota limits faster than expected.

For production, create your own Google Cloud OAuth app and use those credentials in the YouTube auth config. That gives your project its own YouTube API quota and lets you control scopes, branding, and quota increase requests in Google Cloud.
