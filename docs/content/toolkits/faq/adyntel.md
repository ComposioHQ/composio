## Why can Google Ads by company fail before provider request on auth metadata?

- Current status as of 2026-06-21: `In Master`, not `In Production`

`ADYNTEL_GET_GOOGLE_ADS_BY_COMPANY` can fail before the upstream Adyntel request is completed with errors like `KeyError: 'generic_api_key'` or `KeyError: 'Authorization'`. Treat this as an Adyntel connector auth-field mapping/runtime-version issue, not a native Google Ads OAuth issue.

This looks like an Adyntel connector auth-field mapping issue before the request reaches the provider. If the same auth works for other Adyntel tools, there may not be a user-side fix for this specific Google Ads action until the connector mapping is updated.
