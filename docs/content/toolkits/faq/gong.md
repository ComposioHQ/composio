## Which IP addresses should I allowlist for Gong OAuth?

Gong requires every OAuth integration to have trusted IP addresses configured. Composio exchanges and refreshes Gong OAuth tokens from a fixed set of egress IPs, so add all four of these to both the **Access token** and **Refresh token** allowlists in your Gong integration settings:

```text
52.72.72.59/32
54.243.138.89/32
54.224.131.195/32
34.233.50.61/32
```

Add all four addresses to both lists. Each token path uses a pair of these IPs and can send requests from either one, so a partial allowlist can cause intermittent token or refresh failures.

For more on how Composio secures credentials and network access, see [Security](/docs/security/overview).
