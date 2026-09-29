## Which IP addresses should I allowlist for Gong OAuth?

Gong now requires every OAuth integration to have trusted IP addresses configured. Gong announced this change in September 2026 and is rolling it out in October 2026. See the [Gong release notes](https://help.gong.io/docs/release-notes) for the announcement.

Gong enforces two separate trusted IP lists on each integration:

- **Access Token**: addresses allowed to make Gong API calls with the access token. Gong checks every API request against this list.
- **Refresh Token**: addresses allowed to refresh the access token.

If you use your own Gong OAuth integration with Composio, add all four of these Composio IPs to both the **Access Token** and **Refresh Token** trusted IP lists:

```text
52.72.72.59/32
54.243.138.89/32
54.224.131.195/32
34.233.50.61/32
```

Add all four addresses to both lists. Composio's traffic to Gong can come from any of these addresses, so a partial list can cause intermittent API call or token refresh failures.

To add the IPs in Gong:

1. From the left sidebar, click **Admin center**.
2. In the **Settings** tab, click **API** under **Ecosystem**.
3. In the **Integrations** tab, find your integration, click **More actions**, and select **Edit trusted IPs**.
4. In the **Access Token** and **Refresh Token** fields, enter the four IPs, one per line.
5. Click **Save**. Gong enforces the trusted IP list as soon as you save.

For Gong's full setup guide, see [Add trusted IPs to your integration](https://help.gong.io/docs/configure-trusted-ips-for-your-integration). For more on how Composio secures credentials and network access, see [Security](/docs/security/overview).
