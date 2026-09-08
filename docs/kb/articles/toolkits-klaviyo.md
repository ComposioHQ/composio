## Klaviyo schema keys that exceeded Claude's 64-character limit were fixed

For Klaviyo tool schemas that failed Claude validation because flattened nested property keys exceeded 64 characters, the backend schema-generation issue was fixed in the latest version. Update or re-fetch the latest tools/schema before retrying. The same fix also addressed top-level parameter naming issues such as `$` prefixes; nested `$` parameters were verified as accepted across major model providers and SDKs.
