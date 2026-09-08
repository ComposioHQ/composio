---
type: "reference"
title: "Google Meet"
description: "Public support knowledge for Google Meet."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "googlemeet"
---
# Google Meet


## Use Google Super tool slugs with a Google Super connected account

Google Super is a separate toolkit with its own tool slugs. If the connected account was created for Google Super, run the corresponding GOOGLESUPER_* tool, such as GOOGLESUPER_CREATE_MEET, instead of the GOOGLEMEET_* slug. A separate Google Meet auth config or connected account is not required when the workflow is intentionally using Google Super.

## Configure Meet scopes and enable the Google Meet API before creating Meet spaces

For Meet space creation/settings through Google Super, include the Meet scopes https://www.googleapis.com/auth/meetings.space.created and https://www.googleapis.com/auth/meetings.space.settings in the auth config, then initiate a new connection so the new scopes are granted. Also enable the Google Meet API in the Google Cloud Console project backing the OAuth app.

## Fetch transcript entries by first resolving the conference record

Start with `GOOGLEMEET_LIST_CONFERENCE_RECORDS`. It can filter conference records by meeting code, space name, or time range. Use the resulting conference record ID with `GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID`, then call `GOOGLEMEET_LIST_TRANSCRIPT_ENTRIES` with the transcript resource to retrieve the spoken segments.

## 403 permission errors usually mean the conference resource is inaccessible or missing

For a Google Meet API error like "Permission denied on resource Conference (or it might not exist)", verify that the signed-in connected account has access to the conference/artifact and that the conference record exists. Compare the provider response through a least-privileged Composio tool or Proxy Execute call; provider tokens are redacted from connected-account responses and should not be copied into a support workflow.

## Recordings and transcripts require an eligible Google Workspace edition and enabled feature

Google Meet recordings and transcripts are available on several eligible Google
Workspace editions, not only Enterprise. The meeting host must have the feature,
the organization's administrator must allow it, and recording or transcription
must have been started for the meeting. Free personal accounts do not provide
the same artifact availability.

Check Google's current [Meet feature matrix](https://support.google.com/meet/answer/10459644)
and [transcript requirements](https://support.google.com/meet/answer/12849897)
when diagnosing a missing recording or transcript.
