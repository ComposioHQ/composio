## How should I handle scoped Productlane v2 keys returning 401 on current toolkit actions?

Productlane's current scoped keys are v2 keys. The official API v2 base URL is:

https://productlane.com/api/v2

Productlane authenticates v2 requests with:

```http
Authorization: Bearer <API_KEY>
Composio's Productlane toolkit uses the credential field `generic_api_key` and sends:http
Authorization: Bearer ${generic_api_key}
For direct/custom credential execution, users should pass:json
{
  "val": {
    "generic_api_key": "<PRODUCTLANE_API_KEY>"
  }
}
If a `pl_v2_...` key returns 401 `Invalid key` / `UNAUTHORIZED` through the current Productlane toolkit, verify it against Productlane API v2 directly:bash
curl -H "Authorization: Bearer $PRODUCTLANE_V2_KEY" \
  https://productlane.com/api/v2/me
```

If a user says "some Productlane tools work with the same credentials," check which tools. Workspace and published changelog lookups can return 200 without proving the bearer token works, because they hit public/published v1 surfaces. Treat authenticated collection/resource endpoints such as contacts, companies, users/members, insights, and write actions as the real credential test.

Useful source docs:

- Productlane API: https://productlane.com/docs/integrations/api
- Productlane API v2 Introduction: https://productlane.mintlify.dev/docs/api-v2/introduction
