---
type: "reference"
title: "Zoom"
description: "Public support knowledge for Zoom."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "zoom"
---
# Zoom


## Zoom custom OAuth apps may only connect users in the app owner's Zoom organization unless configured/approved otherwise

If a customer is using their own Zoom OAuth app, verify whether the users they are connecting belong to the same Zoom organization or whether the app is published/approved for external users. An unpublished internal app may only connect users from its own Zoom organization.

## Zoom should use the default Composio redirect URL unless the auth guide says otherwise

For Zoom OAuth setup, do not arbitrarily change the redirect URL. Use the default redirect URL/callback shown by Composio or the Zoom auth guide. If auth fails after redirect changes, recreate or update the auth config with the default redirect URL.

## `ZOOM_GET_A_MEETING_SUMMARY` needs the correct past-meeting UUID and auto summary enabled

For Zoom meeting summaries, verify that the meeting was created with `settings__auto_start_meeting_summary=true`. Then fetch the correct past-meeting UUID from Zoom's `/v2/past_meetings/{meetingId}/instances` endpoint and use that UUID with `ZOOM_GET_A_MEETING_SUMMARY`; the numeric meeting ID alone may not be sufficient.

## Zoom delete/summary tools may require extra scopes in a custom OAuth app

If a Zoom tool fails with a scope or permission issue, check whether the required scope is configured on the customer's Zoom OAuth app. `ZOOM_DELETE_A_MEETING` needs `meeting:write` or `meeting:write:admin`, while fetching past meeting instances or summary UUIDs needs `meeting:read:list_past_instances`.

## Zoom OAuth consent branding comes from the customer's OAuth app

For Zoom OAuth branding, use the customer's own Zoom OAuth app. The OAuth consent screen logo/name is picked up from the OAuth app settings rather than from Composio alone.
