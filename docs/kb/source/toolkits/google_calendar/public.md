---
type: "reference"
title: "Google Calendar"
description: "Public support knowledge for Google Calendar."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "google_calendar"
---
# Google Calendar

## Create a Google Calendar integration to access tools and triggers

Create a Google Calendar integration/auth config, connect the account, and then use the Google Calendar toolkit's tools and triggers through that connected account.

## Updating RSVP status has an attendee-list API limitation

Google Calendar can limit RSVP/status updates when an event has multiple attendees. Update the authenticated user's RSVP and then re-add the attendees, or resend the attendee list with the updated status.

## Canceled/deleted event trigger sends payloads for canceled or deleted events

`GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER` sends a payload when an event is canceled or deleted.

## Multiple triggers for the same slug/user can target different calendar IDs

Multiple triggers for the same trigger slug and user are supported when each trigger is configured for a different `calendarId`.

## `calendar.events` scope is required for event list/fetch flows

Ensure the connected account has `https://www.googleapis.com/auth/calendar.events` when calling event-list or event-fetch tools that require event access.

## Google Calendar triggers now return full event data instead of only an ID

The newer Google Calendar new-event trigger payload includes complete event data rather than only the event ID.

## Google Calendar trigger moved toward polling for more verbose payloads

Google Calendar trigger behavior moved from webhook-style delivery toward polling so payloads can include more detail and require less follow-up processing. Existing trigger flows were preserved while polling could be introduced separately where needed.

## Use trigger-types endpoint to retrieve Google Calendar trigger info programmatically

Use the trigger-types endpoint to retrieve Google Calendar trigger metadata programmatically, and use the triggers documentation for setup guidance.

## Use Find Free Slots when you need processed availability; free/busy does not do timezone processing

Use the find-free-slots tool when you need processed availability. Query-free/busy returns provider data without extra processing such as timezone handling, so callers using free/busy may need to process it themselves.

## Use `primary` as calendar ID; `me` is not valid for calendar ID

For Google Calendar tools, use a calendar ID such as `primary`; `me` is not a valid Google Calendar ID.

## Use latest Google Calendar toolkit version when filters are ignored

Older pinned Google Calendar toolkit versions can drop or remap filters such as `timeMin` and `timeMax` before the request reaches Google. Use the latest toolkit version or v3.1/latest behavior when filter changes produce identical results.

## Google Calendar meeting link is returned in `hangout_link`

After creating or updating a calendar event with conferencing, read the generated meeting URL from the response's `hangout_link` field.
