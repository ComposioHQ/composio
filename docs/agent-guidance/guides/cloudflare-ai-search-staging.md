# Stage Cloudflare AI Search

Target date: 2026-11-20. Docs uses MCP only. The landing implementation lives in
`ComposioHQ/landing` and needs the landing instance's base endpoint URL.

## NEEDS BRENDAN:

Brendan or the administrator of the Cloudflare account holding `composio.dev`
must run the setup below, or supply a company-scoped API token through the
approved secret store. No Cloudflare credential was found in the VM environment,
Wrangler login config, or any of the 11 accessible Doppler configs across
`dashboard`, `landing`, and `metrics-composio-io` on 2026-11-19. The personal
Composio connections `print-queue`, `q2cue-alerts`, and `domain-check` were not used.
An urgent `cos-notify` access request was accepted with HTTP 202.

Before creating resources, Brendan must choose:

- Separate staging instances and staging hostnames, or real instances used only
  by preview deployments.
- Final docs and landing hostnames. Each instance needs its own hostname.
- Public endpoints or Cloudflare Access during staging. Access requires an
  authenticated browser for the landing modal and service credentials for curl
  and MCP clients.

For automation, create a custom token at
[My Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens).
Restrict account permissions to the account holding `composio.dev`, and zone
permissions to that zone:

- Account > AI Search > Edit and Run, per the
  [AI Search API setup](https://developers.cloudflare.com/ai-search/get-started/api/).
- Zone > Zone > Read, DNS > Edit, and WAF > Edit for zone lookup, the two new
  hostname records, and the crawler exception. API permission names include
  `Zone Read`, `DNS Write`, and `Zone WAF Write`; see the
  [permissions list](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).
- If Access is selected, Account > Access: Apps and Policies > Write. Have the
  Zero Trust administrator create service credentials if needed.

Do not change or relink shared Composio connections. A website source does not
need an R2 or D1 service API token.

## Create the two instances

1. Open [Cloudflare](https://dash.cloudflare.com/), select the account containing
   `composio.dev`, and open **AI Search > Create Instance**.
2. If separate staging instances were approved, name them
   `composio-docs-staging` and `composio-landing-staging`. Otherwise use the names
   approved by Brendan. Check for existing instances before creating duplicates.
3. Select **Website** as the data source. For docs, use `docs.composio.dev` and
   the specific sitemap `https://docs.composio.dev/sitemap.xml`. For landing, use
   `composio.dev` and `https://composio.dev/sitemap.xml`. Select the `sitemap`
   parse type, not recursive discovery. Keep the two corpora separate.
4. Review and create. Website indexing starts automatically. In the instance's
   **Items** tab, inspect crawl and indexing failures. The **Playground > Search**
   tab can test indexed content before an endpoint is advertised.

The [dashboard setup](https://developers.cloudflare.com/ai-search/get-started/dashboard/)
and [website source guide](https://developers.cloudflare.com/ai-search/configuration/data-source/website/)
describe these steps. Record actual indexed, pending, and failed counts.
At the Free plan's 500 pages/day limit, 2,503 docs pages take at least six days
and 916 landing pages at least two. Full indexing by 11/20 is not assured.
Check the account's plan and
[current limits](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)
before promising complete coverage or approving a paid upgrade.

## Allow the landing crawler

In the `composio.dev` zone, open **Security > WAF > Custom rules > Create rule**.
Name the rule `Allow Cloudflare AI Search crawler`. Match **Bot Detection ID**
**equals** `122933950`, scoped to the landing source hostnames `composio.dev` and
`www.composio.dev`. Choose **Skip**, place it **First**, and deploy. Select the
remaining custom rules, managed WAF rules, and Super Bot Fight Mode checks that
would otherwise challenge the crawler. Keep request logging on and inspect a
crawl request in Security Events. Do not exempt the search endpoint hostnames.

This follows the website guide's **Allow AI Search through WAF** procedure.
`docs.composio.dev` is DNS-only to Vercel and needs no Cloudflare WAF exception.
Keep that DNS record unchanged.

## Configure endpoints before sharing URLs

For each instance, open **Settings > Public Endpoints**. Set **Rate limiting**
to **10 requests per 1 minute**, using a sliding period, before sharing any URL.
Enable MCP. Disable chat completions. Enable search on the landing instance;
enable it temporarily on docs for the required curl check, then disable it so
docs exposes MCP only. Set the docs tool description to:

```text
Search Composio documentation for SDK setup, authentication, tools, API references,
and troubleshooting. Read the cited documentation for complete code examples.
```

Restrict landing **Authorized hosts** to the approved preview origins. Add each
preview origin explicitly. CORS does not authenticate callers. Read back the
rate limit after every change. These controls are documented in
[public endpoint settings](https://developers.cloudflare.com/ai-search/configuration/retrieval/public-endpoint/).

Under **Custom Domains**, attach the approved hostname. In **DNS > Records**,
create a **Proxied CNAME** from that hostname to the generated
`<PUBLIC_ENDPOINT_ID>.search.ai.cloudflare.com`. The ID is assigned by Cloudflare;
it cannot be inferred from the instance name. Wait for certificate validation.
See [custom domains](https://developers.cloudflare.com/ai-search/configuration/retrieval/public-endpoint/custom-domains/).

If Access was selected, configure **Zero Trust > Access controls > Applications >
Add an application > Self-hosted** for each hostname, with the approved team
Allow policy. Add a Service Auth policy for a dedicated staging service token.
Set `default_domain_enabled` to `false` so the generated hostname cannot bypass
Access. Keep the CNAME pointed at that generated hostname. Every API update
replaces `public_endpoint_params` in full, so include the rate limit, origins,
endpoint toggles, domains, and `default_domain_enabled` on every update.
See [Access setup](https://developers.cloudflare.com/ai-search/configuration/retrieval/public-endpoint/cloudflare-access/).

## Verify with curl

Replace the URL with each actual endpoint, without a trailing slash. Run for both
instances. If Access is enabled, add the two service-token headers to every curl
request. Keep credentials out of saved output.

```bash
SEARCH_BASE_URL='https://<approved-search-hostname>'

curl --fail-with-body --max-time 60 -i "$SEARCH_BASE_URL/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

curl --fail-with-body --max-time 60 -i "$SEARCH_BASE_URL/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search","arguments":{"query":"How do I connect an account with Composio?"}}}'

curl --fail-with-body --max-time 60 -i "$SEARCH_BASE_URL/search" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"How do I connect an account with Composio?"}]}'
```

Expect successful HTTP responses, a `search` tool in `tools/list`, and useful
results citing the correct source domain. HTTP 200 alone does not prove the MCP
call succeeded. Check for JSON-RPC errors or `isError`, and inspect citations.
The [MCP request format](https://developers.cloudflare.com/ai-search/api/search/mcp/)
and [search body](https://developers.cloudflare.com/ai-search/api/search/public-endpoint/)
follow Cloudflare's examples. If the server requires a session, initialize the
MCP connection and retain its session header before these calls.

For Access, also verify that unauthenticated custom-host requests are denied and
the generated host returns 404 with error `60018`. Disable docs `/search` after
its successful test and confirm it is closed. Confirm `/mcp` still works.

## Advertise only a verified endpoint

Set `DOCS_SEARCH_MCP_URL=https://<approved-docs-search-hostname>/mcp` in the docs
Vercel Preview environment and redeploy. `/llms.txt` then names the remote MCP
server and its read-only search tool. Leave this variable unset in Production
until publication is approved. This does not mount anything at the existing
`docs.composio.dev/mcp` redirect or add Cloudflare UI to docs.

The source-backed sitemap implementation is already on `next` in commit
`945771297`, but Vercel's isolated docs root generated no dates without source
history. The build script now fetches metadata for the exact deployed commit
when the Git checkout is unavailable, and bundles the generated manifest into
server code. An empty Vercel manifest fails the build. A 2026-11-19
production curl found 2,503 URLs and zero dates. The local generator produced
dates for 241 authored pages. Verify the preview's
`/sitemap.xml` includes the quickstart's real source date. Generated toolkit,
API, KB, and browse pages deliberately omit dates until their updates can be
attributed to individual pages. Do not substitute build time for `<lastmod>`.

Give the landing thread and CoS the actual landing base endpoint URL, its `/mcp`
URL, auth mode, allowed preview origins, rate limit, and crawl counts. They must
not guess the generated ID. The landing thread owns its Cmd+K modal and agent
catalog discovery. Endpoint URLs and crawl progress remain unavailable until
the Cloudflare access blocker is resolved.
