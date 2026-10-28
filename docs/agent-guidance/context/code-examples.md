# Code examples: Python, TypeScript, and API

Maintained operation examples offer Python, TypeScript, and API options. A valid marker records an exception; it does not establish that the exception is justified or the examples are equivalent.

## Canonical language group

````mdx
<Tabs groupId="language" items={['Python', 'TypeScript', 'API']} persist>
<Tab value="Python">
```python
# Python SDK operation
```
</Tab>
<Tab value="TypeScript">
```typescript
// Equivalent TypeScript SDK operation
```
</Tab>
<Tab value="API">
```bash
curl https://backend.composio.dev/api/v3.1/tools \
  -H "x-api-key: $COMPOSIO_API_KEY"
```
</Tab>
</Tabs>
````

- Keep the order Python, TypeScript, API. Use `python`, `typescript`, and `bash` fences.
- Preserve the operation, inputs, user identity, account pinning, filters, pagination, permissions, version selection, and output in all options. Expand SDK defaults, transformations, polling, and create-or-update behavior in curl.
- A tab may contain installation instructions, output fences, a table, or an SDK-gap Callout. Empty code fences and another language's code are not substitutes.
- Versioned migration labels may share a suffix such as `(previous)` or `(current)`. A suffix never implicitly waives the API option. Current operations need an API tab; obsolete names may use a precise `no-api` marker pointing to the current replacement.
- A polling helper still has an HTTP equivalent. Show the initial request and the polling/terminal states, not only the first request.

### Plain Markdown

FAQ and KB Markdown uses consecutive headings at the same depth:

````md
### Python

```python
# Python operation
```

### TypeScript

```typescript
// Equivalent operation
```

### API

```bash
curl ...
```
````

The FAQ and KB renderers turn these headings into persistent language tabs. Agent Markdown keeps the labels and all variants. For an unavailable SDK endpoint, a `> [!NOTE]` block under that language heading becomes an SDK-gap Callout.

The last option runs until the next heading at the same or a higher level. When prose after the group applies to every language, close the group with `<!-- end-languages -->` on its own line before that prose. Without the marker, the renderers hide the shared prose inside the last tab.

## Exceptions and SDK gaps

Use MDX comments in `.mdx` files and HTML comments in `.md`. A marker must be an actual comment node, not text inside code, an attribute, a string, or inline code. Local markers attach only across whitespace.

| Kind | Placement | Allowed reason |
|---|---|---|
| `single-language` | Immediately before a standalone SDK/API fence or a framework-selector Tabs group | The named runtime, provider, or package genuinely exists in only one language |
| `single-language-page` | After frontmatter | The entire page is about a language-specific runtime; do not use it for a project that can be implemented in both SDKs |
| `no-api` | Immediately before a language group, including a Markdown heading group | The operation is local orchestration or transformation, not a remote operation hidden behind an SDK helper |
| `unchecked-api` | Immediately before the affected curl fence | One identified rule/operation/field cannot be checked against the committed schema |

Every marker needs a specific `reason="..."`. Project size or translation effort is not a reason. Use local markers instead of page-wide exemptions when other examples have counterparts. Install commands do not require an API option.

If an SDK lacks the operation, keep its language option and explain the gap in a nonempty Callout. Link to the working API equivalent. Verify the SDK implementation, generated client, and committed OpenAPI schema before claiming a gap. Prefer a real raw-client call when the public raw client supports the operation.

### Narrow API exceptions

An API exception identifies the exact rule and operation, and the affected field when applicable:

```mdx
{/* code-example: unchecked-api reason="The committed session schema omits this supported callback field" rule="api-body-schema" operation="PATCH /api/v3.1/tool_router/session/{session_id}" field="manage_connections.callback_url" */}
```

Allowed exception rules are defined by `EXEMPTIBLE_RULES` in `lib/api-snippets.ts`. Add separate markers for separate operations. A field exception does not waive route, method, authentication, version, or other body validation. Unused exceptions fail, so remove them when the schema catches up. Unsupported shell/curl syntax and opaque request bodies must not silently bypass validation.

## Inventory and validation scope

Run `bun run inventory:code-examples` for JSON records with source path, line, kind, language/options, validation category, and exception reason. The inventory includes:

- Authored guides, examples, reference overviews, toolkit FAQs, KB source and curated KB articles.
- Generated API/KB presentation copies and every OpenAPI path/webhook operation.
- Generated language-specific SDK symbol references, including signatures and partial usage fragments.
- Historical changelog fences.
- `PackageInstall`, `FileBuildup`, and `RepoBrowser` invocations and their committed source files/stages. Shared source-runtime reasons live in `lib/example-sources.ts`; new sources require an explicit classification.
- Agent-only Markdown examples injected from `lib/llm-guardrails`. The checks use `#rendered.md` projections with source-line padding, not the TypeScript template-literal syntax.

The maintained-file checks read `content/docs`, `content/examples`, authored `content/reference`, `content/toolkits`, `api-overviews`, `kb/source`, `kb/articles`, and the injected guardrail projections. Generated API overview and KB copies are checked through their maintained inputs, not treated as independent editable examples.

Generated SDK symbol references remain language-specific: signatures and partial fragments are inventoried, not translated or certified by the maintained-example gates. Historical release examples are also inventoried rather than rewritten against today's API. These are explicit validation limits, not proof that every rendered fence offers three runnable equivalents. Edit reference generators/SDK docstrings or historical source deliberately; do not hand-edit generated pages to satisfy a gate.

Component-backed complete applications use runtime-specific source classifications, not invisible parser exclusions. A Pi, Vercel AI SDK, local-workbench, or eve/macOS application does not acquire a second runtime merely because its source browser is indexed. Shared SDK operations elsewhere on those pages still need counterparts.

## Checks

Run from `docs/`:

| Command | What it establishes |
|---|---|
| `bun run inventory:code-examples` | Full recorded surface and explicit validation/exemption categories |
| `bun run check:code-examples` | Markdown/MDX AST boundaries, tab order/content/languages, local marker placement, known file-backed sources |
| `bun run check:api-snippets` | Supported curl syntax, operation selection, auth alternatives, API versions, and JSON Schema constraints against committed v3.1/v3 specs |
| `bun run check:python-snippets` | Syntax for maintained Python fences, SDK-attributed mypy diagnostics against the local Python SDK/providers, and `# type: ignore` policy |
| `bun run test:python-snippets` | Real Python helper regressions, including aliases, local classes, argument/TypedDict errors, SDK-model indexing, misspelled SDK bindings, suppressions, and fragment scope |
| `bun run check:typescript-snippets` | Actual TypeScript diagnostics for API overviews, authored reference, and Markdown FAQ/KB inputs outside build-time Twoslash |
| `bun run test` | Python-free static checker and rendering regressions |
| `GITHUB_ACTIONS=true bun run build` | Production rendering and build-covered Twoslash examples, using the CI worker limit |

The Python helper uses `uv run --frozen` with the locked `docs-snippets` dependency group and Python 3.12. Its conventional-fragment prelude supplies missing module-level SDK names without replacing imported aliases, local classes, or nested bindings. It retains unrelated Python/third-party diagnostics separately; the gate fails syntax and SDK-attributed errors, not every possible Python error. SDK-attributed errors include wrong calls, attributes, and imports; missing keys on SDK TypedDicts; indexing an SDK model such as `response["status"]` (use `response.status`); assigning an SDK result to an incompatible annotation; and an undefined name that mypy identifies as a misspelling of an SDK-valued binding. Undefined fragment context and unknown third-party or hypothetical packages stay separate. `(previous)` examples are syntax-only. This is a local-source compatibility check, not a check against a separately installed published Python release.

A `# type: ignore` must name its mypy error codes, such as `# type: ignore[arg-type]`, and be explained by a comment on the same line, inside the enclosing statement, or directly above it. The explanation must describe a verified SDK typing gap. Ignores that no longer suppress an error fail as unused.

TypeScript uses the SDK/provider versions installed from `docs/package.json` and `docs/bun.lock`, not the local TypeScript workspace source. See `twoslash.md` for build coverage and precise annotations. Python and TypeScript therefore have different version boundaries; review install instructions and release compatibility explicitly.

All static checks are offline with respect to Composio: no credentials, accounts, tool execution, or authenticated API requests are needed. They do not prove response schemas beyond the committed contract, jq correctness, live endpoint behavior, cross-language semantic equivalence, or justified exemption reasons. Review those against SDK implementation and schema evidence, and inspect the rendered options and agent Markdown.
