# Toolkits Page

## Design Decisions

### No Sidebar
- 862 toolkits would bloat sidebar
- Breadcrumb navigation only

### No Input Parameters
- LLMs read schemas automatically
- Platform playground is better for exploration

### No Scopes Display
- Only have scope names, not descriptions
- Auth method badge is sufficient

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

- Gzip: 45MB → 7MB (85% reduction)
- Per-toolkit files: detail pages load only what they need
- Server-side decompression: 2-9ms, negligible

### Why Not Git?

- 862 auto-generated files would bloat git history
- Generated at build time, not committed

---

## Build Strategy

Simple approach:
- **Vercel (prod + preview)**: Always regenerates fresh data
- **Local dev**: Skips if data exists (for speed)

Build time is ~2 minutes. This is acceptable - keeps things simple and ensures data is always fresh.

### Generator Script

```typescript
// On Vercel, always regenerate. Locally, skip if exists.
const isVercel = !!process.env.VERCEL;
const FORCE_REGEN = isVercel || process.env.FORCE_TOOLKIT_REGEN === 'true';

if (!FORCE_REGEN && existsSync(INDEX_FILE)) {
  process.exit(0); // Skip locally
}

// Generate fresh data...
```

### Environment Variables

```
COMPOSIO_API_KEY        # Required
COMPOSIO_API_BASE       # Optional, defaults to prod API
FORCE_TOOLKIT_REGEN     # Set "true" to regenerate locally
```

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

## Key Principles

1. **Static pages everywhere** - All 862 pages pre-rendered at build time
2. **Fresh data on every deploy** - No caching, no stale data
3. **Simple over fast** - 2 min build is acceptable for simplicity
4. **No git bloat** - Generated files not committed
5. **Graceful degradation** - Empty arrays/null on errors
