## Instagram requires a Business or Creator account

Instagram toolkit support is for Instagram Business/Creator account flows. If a user is using a personal Instagram account, convert or connect a Business/Creator account linked through Meta/Facebook as required by Instagram's API.

## Why can Instagram reply-to-comment fail with the managed OAuth app?

Instagram comment tools can require Meta's comment-management permission, such as `instagram_manage_comments` for Facebook Login or `instagram_business_manage_comments` for Instagram Business Login. Those permissions must be configured on the Meta app and approved by Meta before the OAuth flow can grant them.

If a reply-to-comment flow fails because the managed OAuth app does not currently have the required comment permission, use your own Meta OAuth app with that permission configured and approved. Composio is working on managed-app approval for the missing permission, but an owned Meta app is the current unblock path for production usage.
