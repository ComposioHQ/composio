## Maps Embed API requires API-key authentication

`GOOGLE_MAPS_MAPS_EMBED_API` requires API-key authentication. Use an auth config whose auth mode is `api-key`, or pass the `api_key` parameter directly when making the tool call.

## Google Maps OAuth can be blocked by sensitive cloud-platform scope

Check whether the OAuth app requests the sensitive `https://www.googleapis.com/auth/cloud-platform` scope. If the Google OAuth app has not been verified, users who are not listed as test users and are outside the registering organization can be blocked by Google. Either complete Google verification or ensure the affected users are allowed test/org users for that OAuth app.

## Validate Places `includedTypes` against Google's supported place types

For Google Maps Places requests, `includedTypes` must use values supported by Google's Places API. If a request fails with an invalid argument around `includedTypes`, compare the value against Google's supported place type lists and replace unsupported values before retrying.

## Deprecated `GEOCODING_API` is not the Google Maps toolkit tool to use

`GEOCODING_API` belongs to a different toolkit and has been deprecated. Do not require it as part of normal `google_maps` toolkit usage; use the current Google Maps toolkit tool slugs instead.

## Google Maps APIs may require billing and quota management in GCP

Most Google APIs used through Composio are generally free to access, but Google Maps is an exception: Maps APIs can require billing on the Google Cloud project. If usage exceeds limits, customers may need to request higher limits in their own Google project.
