# `@composio/json-schema-to-effect-schema`

Internal, eval-free JSON Schema validation exposed through Effect Schema.

The package uses `@cfworker/json-schema`, an interpreter designed for runtimes where dynamic code
generation is unavailable. It also normalizes the OpenAPI and Composio schema extensions accepted by
the previous Zod-backed tool-input validator.
