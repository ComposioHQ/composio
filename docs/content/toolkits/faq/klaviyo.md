## How should I handle Klaviyo schema keys that exceed Claude's 64-character limit?

For Klaviyo tool schemas that fail Claude validation because flattened nested property keys exceed 64 characters, update or re-fetch the latest tools/schema before retrying. Current schema generation avoids the long flattened keys and top-level `$` parameter names that can trigger model-provider validation errors.
