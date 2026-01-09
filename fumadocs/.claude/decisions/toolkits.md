# Toolkits Page

## Design Decisions

### No Sidebar
- 862 toolkits would bloat sidebar
- Breadcrumb navigation only (`← Back to Toolkits`)

### No Input Parameters
- LLMs read schemas automatically
- Platform playground is better for param exploration

### No Scopes Display
- Only have scope names, not descriptions
- Auth method badge is sufficient (OAuth2, API_KEY, etc.)

### Search-First Landing
- Search + category filter + cards
- Client-side filtering from pre-generated JSON

---

## URL Structure

```
/toolkits                   → Landing (search + filter + cards)
/toolkits/premium-tools     → Premium tools info (MDX)
/toolkits/{slug}            → Individual toolkit page
```

---

## Data Architecture

### File Structure

```
public/data/
├── toolkits.json.gz          # Index (~64KB compressed)
└── toolkits/
    ├── gmail.json.gz         # Full toolkit data (~8KB avg)
    ├── github.json.gz
    └── ... (862 files, ~7MB total)
```

### Why Gzip + Individual Files?

Original approach had problems:
- 45MB uncompressed JSON
- GitHub 100MB file limit
- Client bundle bloat

Current approach:
- Gzip: 45MB → 7MB (85% reduction)
- Per-toolkit files: detail pages load only what they need
- Server-side decompression: 2-9ms, negligible

### Why Not Git?

- 862 auto-generated files would bloat git history
- Data changes frequently (new tools, updated descriptions)
- Generated at build time instead

---

## Build Strategy

### The Problem

Build-time generation takes ~2 minutes (API calls + static page generation).
This is fine for production, but too slow for preview deployments.

### Solution: Vercel Build Cache

Vercel persists `.next/cache/` between builds on the same branch.

```
Production deploy:
  → Always regenerates fresh data (~2 min)
  → Saves to .next/cache/toolkit-data/

Preview deploy:
  → Restores from .next/cache/ if available (~instant)
  → Falls back to fresh generation if not cached
```

### Generator Script Flow

```typescript
// scripts/generate-toolkits.ts

const isProduction = process.env.VERCEL_ENV === 'production';
const FORCE_REGEN = isProduction || process.env.FORCE_TOOLKIT_REGEN === 'true';

// 1. Skip if output exists (local dev)
if (!FORCE_REGEN && existsSync(INDEX_FILE)) {
  process.exit(0);
}

// 2. Restore from Vercel cache (preview builds)
if (!FORCE_REGEN && existsSync(CACHE_INDEX)) {
  cpSync(CACHE_INDEX, INDEX_FILE);
  cpSync(CACHE_TOOLKITS, TOOLKITS_DIR, { recursive: true });
  process.exit(0);
}

// 3. Generate fresh (production or no cache)
await fetchAndGenerate();
cpSync(INDEX_FILE, CACHE_INDEX);
cpSync(TOOLKITS_DIR, CACHE_TOOLKITS, { recursive: true });
```

### When Cache Refreshes

| Scenario | Behavior |
|----------|----------|
| Production deploy | Always regenerates fresh |
| Preview on branch with prior builds | Uses cached data |
| Preview on new branch | Generates fresh (then cached) |
| Local `bun run dev` | Uses existing data |
| Local `bun run build` | Generates if missing |
| `FORCE_TOOLKIT_REGEN=true` | Always regenerates |

---

## Runtime Data Loading

`lib/toolkit-data.ts` - Simple gzip reader:

```typescript
async function readGzippedJson<T>(filePath: string): Promise<T> {
  const compressed = await readFile(filePath);
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString('utf-8'));
}

// Returns null on error (graceful degradation)
export async function getToolkitBySlug(slug: string): Promise<Toolkit | null>

// Returns [] on error (graceful degradation)
export async function getToolkitSummaries(): Promise<ToolkitSummary[]>
```

---

## Environment Variables

```
COMPOSIO_API_KEY        # Required for generation
COMPOSIO_API_BASE       # Optional, defaults to prod API
FORCE_TOOLKIT_REGEN     # Set "true" to bypass cache
VERCEL_ENV              # Auto-set by Vercel (production/preview/development)
```

---

## Scripts

```json
{
  "build": "bun run generate:toolkits && next build",
  "generate:toolkits": "bun scripts/generate-toolkits.ts"
}
```

---

## Key Principles

1. **Static pages everywhere** - No SSR, all pages pre-rendered at build time
2. **Production gets fresh data** - Users see latest toolkits
3. **Previews are fast** - Use cached data, don't wait 2 min for every push
4. **No git bloat** - Generated files not committed
5. **Graceful degradation** - Empty arrays/null on errors, not crashes
