## Enhanced Security Masking for Sensitive Fields

We've improved the security masking for `REDACTED` fields in the following APIs:

- [Get Connected Account](https://docs.composio.dev/rest-api/connected-accounts/get-connected-accounts-by-nanoid)
- [List Connected Accounts](https://docs.composio.dev/rest-api/connected-accounts/get-connected-accounts)

**What's Changed:**
Sensitive fields are now partially masked, revealing only the **first 4 characters** to help with debugging while maintaining security.

**Example:**
```
Before: REDACTED
After:  abcd...
```

### Disabling Masking

If you need to disable masking for your use case, you have two options:

1. **Via UI:** Navigate to **Project Settings** → **Configuration** tab and update the masking settings
2. **Via API:** Use the [Patch Project Config API](https://docs.composio.dev/rest-api/projects/patch-org-project-config)