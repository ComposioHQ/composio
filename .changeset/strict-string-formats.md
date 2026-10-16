---
'@composio/core': patch
---

Strip string `format` values that OpenAI structured outputs rejects from strict tool schemas

`toStrictJsonSchema` now removes a `format` on a string schema unless it is one of `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, or `uuid`. OpenAI rejects any other string format in strict mode with a 400 for the whole request, so a single tool with `format: "uri"`, a custom format such as `repo.nwo`, or the `format: "path"` that file uploads add made every strict request fail. The removal is reported as an `unsupported-keyword-stripped` change. Formats on number and integer schemas are kept, since the API does not check them.
