## How do I set up custom OAuth credentials for Zoom?

For a step-by-step guide on creating and configuring your own Zoom OAuth credentials with Composio, see [How to create OAuth credentials for Zoom](https://composio.dev/auth/zoom).

## When should I use a custom Zoom OAuth app?

Use the user's own Zoom OAuth credentials when they need to control app branding, approval state, scopes, or third-party user access. For third-party user connections, ensure the Zoom app is active/approved and supports the users being connected.

## How should I handle zoom should use the default Composio redirect URL unless the auth guide says otherwise?

For Zoom OAuth setup, do not arbitrarily change the redirect URL. Use the default redirect URL/callback shown by Composio or the Zoom auth guide. If auth fails after redirect changes, recreate or update the auth config with the default redirect URL.

## How do I create a new Zoom auth config if the default OAuth app changed after the config was created?

If a Zoom auth config was created before the current default OAuth app settings were updated, creating a new auth config plus a fresh connection is usually the cleanest path.

## What does `ZOOM_GET_A_MEETING_SUMMARY` need?

For Zoom meeting summaries, verify that the meeting was created with `settings__auto_start_meeting_summary=true`. Then fetch the correct past-meeting UUID from Zoom's `/v2/past_meetings/{meetingId}/instances` endpoint and use that UUID with `ZOOM_GET_A_MEETING_SUMMARY`; the numeric meeting ID alone may not be sufficient.

## How should I handle zoom delete/summary tools may require extra scopes in a custom OAuth app?

If a Zoom tool fails with a scope/permission issue, check whether the required scope is configured on the user's Zoom OAuth app. Examples include delete-meeting scopes for `ZOOM_DELETE_MEETING` and `meeting:read:list_past_instances` for fetching meeting instances/summary UUIDs.

## How should I handle zoom OAuth consent branding comes from the user's OAuth app?

For Zoom OAuth branding, use the user's own Zoom OAuth app. The OAuth consent screen logo/name is picked up from the OAuth app settings rather than from Composio alone.
