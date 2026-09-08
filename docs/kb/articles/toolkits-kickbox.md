## Single verification auth and EU endpoint checks

For `KICKBOX_SINGLE_VERIFICATION_API`, the Composio credential field is `generic_api_key`. For direct/custom credential execution, customers should pass:

```json
{
  "val": {
    "generic_api_key": "<KICKBOX_API_KEY>"
  }
}
```

Do not assume `api_key` is the correct field name for Composio custom credential data. The Kickbox provider API itself documents an `apikey` query parameter, but Kickbox's official quickstart also says `Authorization: Bearer <API key>` is accepted. Composio currently uses the Bearer header and `https://api.kickbox.com/v2/verify`, which is valid for standard Kickbox accounts.

If Kickbox returns 403 `Invalid API key`, verify:

- the redacted `custom_connection_data.val` shape

- key validity

- key permissions

- account/credit state

- whether the Kickbox account is EU-only

Kickbox docs say EU-only accounts that sign in from `app.eu.kickbox.com` must use `api.eu.kickbox.com`. If your account is EU-only, contact Composio support about a possible toolkit base-URL/region gap because the current toolkit uses the standard `api.kickbox.com` host.

Useful source docs:

- Single Verification API: https://docs.kickbox.com/docs/single-verification-api

- API Quickstart / authentication and EU endpoint note: https://docs.kickbox.com/docs/using-the-api
