Use this guide to connect Google Calendar, work with event data and availability, configure triggers, and troubleshoot version-specific behavior.

## Connect a Google Calendar account

Create a Google Calendar integration/auth config, connect the account, and then use the Google Calendar toolkit's tools and triggers through that connected account.

Ensure the connected account has `https://www.googleapis.com/auth/calendar.events` when calling event-list or event-fetch tools that require event access.

## Work with events and availability

**Update RSVP status with the attendee-list limitation in mind.** Google Calendar can limit RSVP/status updates when an event has multiple attendees. Update the authenticated user's RSVP and then re-add the attendees, or resend the attendee list with the updated status.

**Use Find Free Slots for processed availability.** Query-free/busy returns provider data without extra processing such as timezone handling, so callers using free/busy may need to process it themselves.

**Use `primary` as the calendar ID.** For Google Calendar tools, use a calendar ID such as `primary`; `me` is not a valid Google Calendar ID.

**Read generated meeting links from `hangout_link`.** After creating or updating a calendar event with conferencing, read the generated meeting URL from the response's `hangout_link` field.

## Configure Google Calendar triggers

**Handle canceled or deleted events.** `GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER` sends a payload when an event is canceled or deleted.

**Create separate trigger instances for separate calendars.** Multiple triggers for the same trigger slug and user are supported when each trigger is configured for a different `calendarId`.

**Expect full event data from newer triggers.** The newer Google Calendar new-event trigger payload includes complete event data rather than only the event ID. Google Calendar trigger behavior moved from webhook-style delivery toward polling so payloads can include more detail and require less follow-up processing. Existing trigger flows were preserved while polling could be introduced separately where needed.

**Retrieve trigger metadata programmatically.** Use the trigger-types endpoint to retrieve Google Calendar trigger metadata programmatically, and use the triggers documentation for setup guidance.

## Troubleshoot ignored event filters

Older pinned Google Calendar toolkit versions can drop or remap filters such as `timeMin` and `timeMax` before the request reaches Google. Use the latest toolkit version or v3.1/latest behavior when filter changes produce identical results.
