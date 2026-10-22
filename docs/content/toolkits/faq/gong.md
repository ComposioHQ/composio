## Which IP addresses should I allowlist for Gong OAuth?

Gong now requires every OAuth integration to have trusted IP addresses configured. Gong's [release notes](https://help.gong.io/docs/release-notes#planned-change-management) list this change as announced in September 2026, with release in October 2026. If Gong gave your integration an October 15, 2026 deadline, add these IPs before that date.

If you use your own Gong OAuth integration with Composio, add all four Composio IPs to both the **Access Token** and **Refresh Token** trusted IP lists:

- `52.72.72.59/32`
- `54.243.138.89/32`
- `54.224.131.195/32`
- `34.233.50.61/32`

Composio's traffic to Gong can come from any of these addresses. If you add only some of them, or add them to only one list, API calls or token refreshes can fail intermittently.

For setup steps, see Gong's guide to [adding trusted IPs to your integration](https://help.gong.io/docs/configure-trusted-ips-for-your-integration).
