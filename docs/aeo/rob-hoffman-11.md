# Documentation AEO review

Reviewed on November 11, 2026, against `next` at `e1f47b0a1` and the live docs site.
This is a bounded review of the shared layout, agent endpoints, and representative pages.
"Done" means the mechanism exists in the inspected paths, not that every page passed an accessibility or content audit.

The source is [Rob Hoffman's post](https://x.com/RobHoffman_/status/2112212215583658420), retrieved in full through [FxTwitter](https://api.fxtwitter.com/RobHoffman_/status/2112212215583658420).
The recommendations below are paraphrased. They are recommendations, not measured results or guarantees about answer engines.
The companion [landing PR #769](https://github.com/ComposioHQ/landing/pull/769) covers composio.dev.
Its report now lives on `cos/rob-hoffman-aeo`, at commit `7edb1590f6f99ecf4b54008ed9b5798e4287b5be`; the supplied `cos/aeo-rob-hoffman-2` ref returns 404.

## The 11 recommendations

Paths in this table are relative to `docs/`.

| # | Recommendation | Status | Evidence and action |
| --- | --- | --- | --- |
| 1 | Name controls and fields, describe images, and keep essential information readable. | applied | `components/toolkits/managed-auth-list.tsx` had a placeholder but no label for its search field. Add an associated label and hide the decorative search icon. `components/copy-button.tsx`, `components/package-install.tsx`, `components/eve-message.tsx`, and Fumadocs's default codeblock already name copy controls. `components/heading.tsx` names section-link controls. `components/kb/knowledge-search-form.tsx` labels its input. This is not a full accessibility audit. |
| 2 | Deliver essential product information in the initial HTML. | needs decision | `app/(home)/docs/[[...slug]]/page.tsx` renders MDX on the server. Curl confirms product definitions in `/docs` and `/docs/authentication` outside scripts. However, `components/quickstart/quickstart-flow.tsx` registers frameworks in effects and `FrameworkOption` returns null until selected. The live quickstart's install commands are absent outside scripts, while `/docs/quickstart.md` contains them. The Mintlify preview's quickstart already includes install commands in HTML. Make no old-stack selector rewrite; verify complete examples in the chosen migration output. |
| 3 | Put the reader's question in the first H2 below the title. | applied | `content/docs/sessions-vs-direct-execution.mdx` previously reached `## Sessions` only after definitions and the comparison table. Its first H2 now asks "Should I use sessions or direct execution?" Existing section anchors remain. The homepage's imperative H2 and its different Markdown heading remain a migration content follow-up because open PR #5255 owns `lib/home-navigation.ts`. |
| 4 | Follow the question with a conditional answer under 100 words. | applied | The same comparison page now answers the new-integration, fixed-tool-set, and existing-integration cases in 53 whitespace-separated words, before the definitions. Move the existing recommendation out of its later callout and remove the duplicate fixed-tool-set sentence. No SDK behavior or examples change. |
| 5 | Define the product, audience, and function in plain language. | done | `components/docs-hero-v2.tsx` describes tools, managed authentication, and execution. `lib/home-navigation.ts` distinguishes Platform applications from personal For You use. `content/docs/toolkits.mdx` defines toolkit and tool in its opening paragraph; `content/docs/providers/index.mdx` defines a provider. No sitewide slogan or title rewrite. |
| 6 | Publish customer quotes as text. | n/a | The inspected docs entry points, quickstart, and authentication guide contain technical guidance, not customer testimonials. Do not add testimonials to documentation. Landing #769 owns the customer-story review. |
| 7 | Verify volatile claims and attach meaningful "as of" dates. | needs decision | `lib/toolkit-count.ts` derives a rounded toolkit count from the checked-in catalog; this is not a live availability count. `public/data/toolkits-list.json` has 1,722 entries at this revision. PR #5308 owns catalog and API snapshot updates. KB facts use `lastVerifiedAt` and `reviewAfter` in `kb/manifest.json`. A product owner must confirm effective dates for commercial, limit, security, and availability claims. An edit date cannot stand in for verification. |
| 8 | Allow answer-engine crawlers, including meta-webindexer. | done | `public/robots.txt` and live `/robots.txt` have `User-agent: *` with `Allow: /` and advertise `/sitemap.xml`. That includes meta-webindexer. Adding a redundant crawler group buys nothing. Robots permission does not prove indexing or bypass upstream access controls. |
| 9 | Fix broken internal links and preserve redirects. | done | `bun run lint:links` reports zero errors for docs and SDK links. A bounded live GET audit of the 49 distinct internal hrefs on `/docs`, `/docs/quickstart`, and `/docs/authentication` returned 49 HTTP 200 responses after redirects. `next.config.mjs` and `proxy.ts` already handle legacy and Markdown routes. No blanket redirect or host work, and no claim about all external links. |
| 10 | Use native navigation, heading, link, and button semantics. | done | Live `/docs` and `/docs/quickstart` contain navigation, header, main, and article elements. `components/product-docs-layout.tsx` uses Fumadocs `DocsLayout`; `components/page-actions.tsx` uses native buttons and links. `components/kb/kb-article-shell.tsx` has a named article navigation landmark. No old-stack layout rebuild. |
| 11 | Review content regularly and show honest publication and revision dates. | needs decision | `lib/content-freshness-build.ts`, `lib/content-freshness.ts`, `app/sitemap.ts`, and `lib/markdown-response.ts` share source-history dates. `source.config.ts` and the docs page template support a `written` stamp. `components/kb/kb-article-shell.tsx` displays verification dates. Ordinary guides have no general visible last-updated line. Live `/docs.md` and `/docs/authentication.md` return `last_updated: null`; the live sitemap has 2,415 URLs and no `lastmod`, while local generation establishes dates for 230 pages. Assign ownership for deployment verification and content review, and settle date display in Mintlify before adding current-stack UI. |

Totals: 4 done, 3 applied, 3 need a decision or owner, 1 not applicable.

## How agents get the content

The site uses Next.js App Router with Fumadocs MDX, configured in `next.config.mjs` and `source.config.ts`.
`lib/source.ts` loads docs, reference, examples, toolkit, KB, and changelog collections and converts components into Markdown.
`mdx-components.tsx` supplies Fumadocs codeblocks, custom headings, and interactive examples.
`app/layout.tsx` supplies the title template and site metadata; each docs page adds its frontmatter title, description, social metadata, canonical URL, and Markdown alternate.

The existing agent endpoints have distinct jobs:

- `app/llms.txt/route.ts` provides a concise routing map with current-session and REST-version guidance.
- `app/llms-index.txt/route.ts` lists guides, references, toolkit links, and knowledge discovery paths, with legacy guidance separated.
- `app/llms-full.txt/route.ts` combines current docs, KB, examples, authored references, and authored toolkit pages. It excludes legacy REST v3.0 and legacy sidebar sections. It is not an export of every dynamic toolkit tool schema or generated API operation.
- `app/llms.mdx/[[...slug]]/route.ts` provides individual Markdown pages, including generated API and toolkit representations. `proxy.ts` routes `.md`, `.mdx`, and negotiated Markdown requests here.

Live `llms-full.txt` returned about 1.6 MB and included quickstart, session SDK reference, and KB content.
`curl -H 'Accept: text/markdown' https://docs.composio.dev/docs/quickstart` returned HTTP 200, `Content-Type: text/markdown; charset=utf-8`, and `Vary: Accept`.
The quickstart Markdown contains the installation and session examples missing from its current initial HTML.
Keep these representations, version distinctions, and redirects as migration acceptance checks; don't build duplicate infrastructure on the outgoing stack.

## Freshness and migration limits

Source edit times record edits, not reviews. Historical examples in `content/docs/migration-guide/` carry `written` or `legacy` labels.
The quickstart explicitly distinguishes the current Python `composio` package from legacy `composio-core`.
REST version metadata identifies v3.1 as current and v3.0 as legacy; those labels are not SDK package versions.
No version contradiction was established in the inspected entry pages. This review does not certify every historical example or pinned provider version.

The [Mintlify preview](https://composio-preview.mintlify.site/docs) already carries the same imperative homepage heading.
Its quickstart includes installation commands in raw HTML. That observation does not certify parity for every framework, language, or interactive example.
Carry the comparison copy to the migration. Preserve the search field's accessible name if that custom component survives.
Freshness ownership and claim verification still require people after a framework change.

This change leaves all paths listed by the open docs PRs inspected on November 11 untouched, including #5253, #5254, #5255, #5308, and #5320 through #5323.
It adds no dependencies, Changeset, SDK behavior, generated data, or landing-host redirects.
`kb/semantic-index.json` must be rebuilt through its generator after the content edit; never patch embedding values or hashes by hand.
The PR records the actual check results and any rebuild limitation.

No AEO improvement is claimed. Evaluate after the next weekly baseline in ComposioHQ/devrel-tools.
