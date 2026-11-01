---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0-rc.20`. The SDK imports the client's types from the one `@composio/client/resources/*` spelling rc.20 publishes and reaches nested types by indexed access; every type the SDK exports keeps its shape. With rc.20, the resources of the client returned by `getClient()` are plain objects typed by interfaces: the resource classes, `Composio.Tools`-style statics and namespace-member types such as `SessionCreateParams.Experimental` are gone, and the `.js`/`.mjs` subpath spellings no longer resolve.
