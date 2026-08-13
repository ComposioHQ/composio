---
'@composio/core': patch
---

Fix three ComposioError subclasses (ComposioToolVersionRequiredError, JsonSchemaToZodError, JsonSchemaRefResolutionError) that omitted their `this.name` assignment and therefore reported `name` as 'ComposioError' instead of their own class name, mis-grouping distinct error types in error telemetry.
