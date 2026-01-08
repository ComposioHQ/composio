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
- Runs automatically during `bun run build`
- Skips if data already exists (caching)
- Not committed to git (in .gitignore)
- Vercel generates fresh data on each deploy

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

### File Architecture

```
public/data/
├── toolkits.json.gz          # Index (slugs, names, counts) - 64KB
└── toolkits/
    ├── gmail.json.gz         # Full toolkit data - ~8KB avg
    ├── github.json.gz
    └── ... (862 files, 7MB total)
```

### Why Individual Files + Gzip?

Original single-file approach hit problems:
- 45MB uncompressed JSON
- GitHub 100MB file limit
- Client bundle included 388KB of JSON

Current approach:
- Gzip: 45MB → 7MB (85% reduction)
- Per-toolkit files: detail pages load only what they need
- Server-side decompression: 2-9ms per file, negligible
- Not committed to git: generated at build time

### Why Build-Time Generation?

- Data always fresh on deploy
- No git history bloat
- Vercel caches build artifacts
- Local dev uses cached data (fast)

### Generator Script

`scripts/generate-toolkits.ts`

```bash
bun run generate:toolkits              # Generate (skips if exists)
FORCE_TOOLKIT_REGEN=true bun run ...   # Force regenerate
```

### Runtime Data Loading

`lib/toolkit-data.ts` handles decompression:
- `getToolkitSummaries()` → returns `[]` if data missing (graceful)
- `getToolkitBySlug(slug)` → throws `ToolkitDataError` if data missing
- Pages show helpful "run generate:toolkits" message on error

### Environment Variables

```
COMPOSIO_API_KEY        # Required (Vercel env vars)
COMPOSIO_API_BASE       # Optional, defaults to prod API
FORCE_TOOLKIT_REGEN     # Set "true" to bypass cache
```

---

## Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "bun run generate:toolkits && next build",
    "generate:toolkits": "bun scripts/generate-toolkits.ts"
  }
}
```

| Command | Generates? | Notes |
|---------|------------|-------|
| `bun run dev` | ❌ | Uses cached data |
| `bun run build` | ✅ (if missing) | Skips if exists |
| `bun run generate:toolkits` | ✅ (if missing) | Manual trigger |
| Vercel deploy | ✅ (if missing) | Build includes generation |

---

## Components to Build

1. `ToolkitSearch` - Search input
2. `CategoryFilter` - Filter chips  
3. `ToolkitCard` - Individual card
4. `ToolkitGrid` - Cards container
5. `ToolsTable` - Searchable tools table
6. `Breadcrumb` - Navigation

---

## Implementation Status

- [x] Generator script with gzip compression
- [x] Landing page with search/filter
- [x] Individual toolkit pages
- [x] Premium tools page
- [x] Build-time generation (no CI needed)
- [x] Caching (skips if data exists)
- [x] Graceful error handling
