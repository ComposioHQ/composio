---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0-rc.17`. The SDK now reports itself to the API client through the client's `identity` option instead of default headers. The headers sent with each request are unchanged, with one exception: on Cloudflare Workers and Vercel Edge with Node.js compatibility enabled, `x-client-runtime` now names that runtime instead of `nodejs`, and the polyfilled Node.js version is no longer sent as `x-runtime-version`. A `createSession()` clone no longer copies these headers into its `defaultHeaders`.

The API client owns these headers, so `defaultHeaders` and `createSession({ headers })` now reject `x-client-provenance`, `x-client-version`, `x-client-library`, `x-client-library-version`, `x-client-language`, `x-client-runtime`, `x-sdk-version`, `x-source`, `x-framework`, `x-runtime` and `x-runtime-version` with a `ComposioError` from `@composio/client`. The SDK used to overwrite such entries silently.

A custom provider whose `name` cannot be sent as a header value (anything other than printable ASCII with no leading or trailing whitespace) is reported as `unknown` in `x-framework`.
