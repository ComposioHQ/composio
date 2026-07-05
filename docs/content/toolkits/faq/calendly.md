## Why can't I configure individual scopes for Calendly?
Calendly's OAuth model grants the access token for all requested scopes at once during authorization; users cannot selectively approve individual scopes. Configure scopes when creating your OAuth app. The resulting access token will include all requested permissions.

## When should I use CALENDLY_POST_INVITEE instead of deprecated CALENDLY_CREATE_EVENT_INVITEE?

For Calendly invitee creation flows, prefer `CALENDLY_POST_INVITEE` instead of `CALENDLY_CREATE_EVENT_INVITEE`. `CALENDLY_CREATE_EVENT_INVITEE` is planned for deprecation, so new implementations and migration guidance should point users to `CALENDLY_POST_INVITEE`.
