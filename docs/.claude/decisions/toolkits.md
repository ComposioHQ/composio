# Toolkits Page - Implementation Plan

## Decisions Made

### No Sidebar
- Toolkits section has no sidebar navigation
- Only breadcrumb navigation (`← Back to Toolkits`)
- Keeps UI clean, avoids 855 items in sidebar

### No Input Parameters on Toolkit Pages
- Users don't need param schemas in docs
- LLMs read schemas automatically
- Platform playground is better for exploring params

### No Scopes Display
- We only have scope names, not descriptions
- Raw scope strings aren't useful to users
- Just show auth method badge (OAuth2, API_KEY, etc.)

### Search-First Experience
- Landing page shows search + category filter + cards
- Don't render all 855 cards upfront
- Filter client-side from pre-generated JSON

### Build-Time Generation
- `bun run generate:toolkits` - separate command
- Not run on `bun run dev` (too slow)
- Run on CI push
- JSON files committed to git (works offline)

---

## URL Structure

```
/toolkits                   → Landing page (search + filter + cards)
/toolkits/premium-tools     → Premium tools pricing/limits info
/toolkits/{slug}            → Individual toolkit page
```

---

## Landing Page (`/toolkits`)

```
┌─────────────────────────────────────────────────────────────┐
│ Toolkits                                   [Request Tools →] │
│ All the toolkits that we support.                           │
│                                                              │
│ 🔍 Search toolkits...                                        │
│                                                              │
│ [All] [Communication] [Developer Tools] [CRM] [Storage]...  │
│                                                              │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                         │
│ │ Gmail   │ │ Slack   │ │ GitHub  │                         │
│ │ GMAIL   │ │ SLACK   │ │ GITHUB  │                         │
│ │ desc... │ │ desc... │ │ desc... │                         │
│ │[OAUTH2] │ │[OAUTH2] │ │[OAUTH2] │                         │
│ │ 🔧37 ⚡2 │ │ 🔧130 ⚡9│ │ 🔧829 ⚡6│                         │
│ └─────────┘ └─────────┘ └─────────┘                         │
│                                                              │
│ ⭐ Some tools are premium. [Learn about pricing →]           │
└─────────────────────────────────────────────────────────────┘
```

---

## Individual Toolkit Page (`/toolkits/{slug}`)

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Toolkits                                          │
│                                                              │
│ [Logo] Gmail                         [Open in Platform →]   │
│ GMAIL (copy)                                                │
│ Gmail is Google's email service...                          │
│                                                              │
│ [OAuth2]  37 Tools  2 Triggers  Communication               │
├─────────────────────────────────────────────────────────────┤
│ ## Authentication                                            │
│ This toolkit uses OAuth2.                                   │
│ [Create Auth Config →]  [How authentication works →]        │
├─────────────────────────────────────────────────────────────┤
│ ## Tools                                                     │
│ 🔍 Search tools...                                           │
│                                                              │
│ | Name              | Description                           │
│ |-------------------|---------------------------------------|
│ | Send email        | Sends an email message to...          │
│ | Create draft      | Creates a draft email...              │
├─────────────────────────────────────────────────────────────┤
│ ## Triggers (only if count > 0)                              │
│ | Name              | Description                           │
│ |-------------------|---------------------------------------|
│ | New email         | Fires when a new email arrives...     │
└─────────────────────────────────────────────────────────────┘
```

---

## Data & Generation

### Single File Architecture

All toolkit data (including tools and triggers) is stored in a **single JSON file**:

```
/public/data/toolkits.json     → All toolkits with tools & triggers (~5-10MB)
```

### Why Single File?

- **Fully static** - No API calls at runtime, fast and reliable
- **No repo bloat** - One file instead of 800+ individual files
- **Git-friendly** - Git compresses JSON well
- **Simple** - Easy to understand and maintain
- **Open source friendly** - Public data, no secrets

### Generator Script
`scripts/generate-toolkits.ts`

Run: `bun run generate:toolkits`

### JSON Structure

```json
// toolkits.json
[
  {
    "slug": "gmail",
    "name": "Gmail",
    "logo": "https://...",
    "description": "Gmail is Google's...",
    "category": "Communication",
    "authSchemes": ["OAUTH2"],
    "toolCount": 37,
    "triggerCount": 2,
    "version": "20260102_00",
    "tools": [
      { "slug": "GMAIL_SEND_EMAIL", "name": "Send email", "description": "..." }
    ],
    "triggers": [
      { "slug": "GMAIL_NEW_EMAIL", "name": "New email", "description": "..." }
    ]
  }
]
```

---

## Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "generate:toolkits": "bun scripts/generate-toolkits.ts"
  }
}
```

| Command | Regenerates? | Use case |
|---------|--------------|----------|
| `bun run dev` | ❌ | Local dev |
| `bun run build` | ❌ | Fast build |
| `bun run generate:toolkits` | ✅ | Manual |
| CI push | ✅ | Auto regenerate |

---

## Components to Build

1. `ToolkitSearch` - Search input
2. `CategoryFilter` - Filter chips  
3. `ToolkitCard` - Individual card
4. `ToolkitGrid` - Cards container
5. `ToolsTable` - Searchable tools table
6. `Breadcrumb` - Navigation

---

## Implementation Order

1. [x] Generator script (`scripts/generate-toolkits.ts`)
2. [x] Landing page + components (category grouping, alphabet sections)
3. [x] Individual toolkit page (version display, auth badges, tool/trigger list with copy)
4. [x] Premium tools page (`/toolkits/premium-tools`)
5. [x] Hybrid architecture (static index + server-side API fetch)
6. [ ] Polish/styling
7. [ ] CI hooks for auto-regeneration

---

## FAQ Section

### How It Works
- Per-toolkit FAQ sourced from plain markdown files in `content/toolkit-faq/{toolkit-slug}.md`
- `##` headings are questions, body text is the answer
- Markdown is converted to HTML at build time using `remark-parse` + `remark-rehype` + `hast-util-to-html` (all transitive deps from Fumadocs, no new packages)
- Rendered as Fumadocs `Accordion` components between the Header and Auth Details sections
- Only shown if a `.md` file exists for that toolkit and has valid Q&A content

### Copy Page / LLM Markdown
- FAQ content is also included in the `/toolkits/{slug}.md` LLM route output
- Heading levels are bumped (`##` → `###`) so questions are children of the `## Frequently Asked Questions` section

### No Sitemap Impact
- FAQ is embedded within existing toolkit pages — no new URLs are created
- No changes to sitemap or routing

### Adding FAQ Content
- Create/edit `content/toolkit-faq/{toolkit-slug}.md` — no code changes needed
- Empty files or files with no valid `##` headings are safely ignored

---

## Future: CI Hooks

- Trigger docs regeneration from toolkit repo changes
- Trigger docs regeneration from API repo changes
