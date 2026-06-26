## How should I handle single verification auth and EU endpoint checks?

For `KICKBOX_SINGLE_VERIFICATION_API`, the Composio credential field is `generic_api_key`. For direct/custom credential execution, users should pass:

```json
{
  "val": {
    "generic_api_key": "<KICKBOX_API_KEY>"
  }
}
```

If Kickbox returns 403 `Invalid API key`, The user should verify:

- the redacted `custom_connection_data.val` shape
- key validity
- key permissions
- account/credit state
- whether the Kickbox account is EU-only

Kickbox docs say EU-only accounts that sign in from `app.eu.kickbox.com` must use `api.eu.kickbox.com`. If the user is EU-only, escalate as a possible toolkit base-URL/region gap because the current toolkit uses the standard `api.kickbox.com` host.

Useful source docs:

- Single Verification API: https://docs.kickbox.com/docs/single-verification-api
- API Quickstart / authentication and EU endpoint note: https://docs.kickbox.com/docs/using-the-api
