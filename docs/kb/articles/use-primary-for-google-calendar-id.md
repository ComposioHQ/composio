Use `primary` when a Google Calendar parameter expects the signed-in user's primary calendar ID. Do not use `me` as a calendar ID.

## Select the correct value

- Use `primary` for the authenticated user's primary calendar.
- For a secondary or shared calendar, first list calendars and pass the returned calendar ID.

This rule is only for parameters that expect a Google Calendar ID. Gmail `userId` parameters can legitimately use `me`, so do not carry that alias across Google toolkits.

Connect the account through [Composio authentication](/docs/authentication) and consult Google's [Calendars: get reference](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/get) for the current Calendar ID contract.
