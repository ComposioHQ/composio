Composio's default Google Drive credentials can use a narrower scope such as `drive.file`, which only reaches files the app created or was explicitly granted access to. Files the user owns but never shared with the app stay invisible, which reads like a broken connection but is the scope working as designed.

If you need broader access, use your own Google OAuth credentials with the `drive` scope enabled and verified on your app, then reconnect through that auth config.

## Confirm which account is connected

Run `GOOGLEDRIVE_GET_ABOUT` for the connected account ID to confirm the email address and identity behind it. That rules out the other common cause of unexpectedly empty results — a connection pointing at a different Google account than the one you are looking at.
