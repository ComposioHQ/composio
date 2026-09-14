# @composio/json-schema-to-effect-schema

## 0.1.1

### Patch Changes

- ab289d6: Translate draft-4 boolean `exclusiveMinimum`/`exclusiveMaximum` flags (as emitted by OpenAPI 3.0 exporters) into their Draft 7 numeric spelling so exclusive bounds are enforced instead of silently ignored.
