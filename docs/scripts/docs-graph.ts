/**
 * docs-graph.ts — content link-graph generator + connectivity checker.
 *
 * Builds a directed graph of the docs where nodes are pages and edges are
 * internal `/docs/...` links in page bodies (markdown links + `href=`).
 *
 * It then checks the *topology* (not broken links — that's validate-links.ts):
 *   1. Weakly-connected components. The biggest is "the main graph". Anything
 *      else is an island — a page (or a little 2-/3-loop) that doesn't mainline
 *      back into the main graph through content links.
 *   2. Reachability from `index` — pages you can't click your way to starting
 *      from the homepage.
 *   3. Short directed cycles (A->B->A, A->B->C->A) that are *isolated* (their
 *      own tiny component). Cycles embedded in the main graph are fine.
 *
 * Usage (from docs/):
 *   bun run scripts/docs-graph.ts                # report for content/docs
 *   bun run scripts/docs-graph.ts --html         # also write docs-graph.html
 *   bun run scripts/docs-graph.ts --dot          # also write docs-graph.dot
 *   bun run scripts/docs-graph.ts --root content/docs --json
 */

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Config / args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = opt('root', 'content/docs'); // dir to scan, relative to cwd
const URL_PREFIX = opt('prefix', '/docs'); // route prefix these files serve at
const MAX_ISLAND = Number(opt('max-island', '4')); // components <= this are "small"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Node {
  /** route relative to URL_PREFIX, e.g. "providers/openai" ("" for index) */
  id: string;
  /** display label */
  label: string;
  file: string;
  out: Set<string>; // internal doc targets (node ids)
  in: Set<string>;
  /** links to other sections (/toolkits, /reference, ...) — keeps a page from
   *  looking orphaned when its only links point outside docs */
  crossOut: string[];
  /** links to /docs/<x> that resolve to no known page (dangling) */
  dangling: string[];
}

// ---------------------------------------------------------------------------
// Build nodes
// ---------------------------------------------------------------------------

function routeFromFile(file: string): string {
  // file is relative to ROOT, e.g. "providers/openai.mdx" or "providers/index.mdx"
  let r = file.replace(/\.mdx$/, '');
  r = r.replace(/\/index$/, '');
  if (r === 'index') r = '';
  return r;
}

const cwd = process.cwd();
const rootAbs = resolve(cwd, ROOT);

const nodes = new Map<string, Node>();
const filesByRoute = new Map<string, string>();

for await (const abs of glob(`${rootAbs}/**/*.mdx`)) {
  const rel = relative(rootAbs, abs);
  const id = routeFromFile(rel);
  nodes.set(id, {
    id,
    label: id === '' ? 'index' : id,
    file: `${ROOT}/${rel}`,
    out: new Set(),
    in: new Set(),
    crossOut: [],
    dangling: [],
  });
  filesByRoute.set(id, abs);
}

// ---------------------------------------------------------------------------
// Extract edges
// ---------------------------------------------------------------------------

// Matches markdown links `](/path...)`, href="/path", href={'/path'} etc.
const LINK_RE = /(?:\]\(|href\s*=\s*["'{]?)(\/[A-Za-z0-9/_\-.#?=&]+)/g;

function normalizeDocTarget(raw: string): string | null {
  // strip anchor + query, trailing slash
  let t = raw.split('#')[0].split('?')[0].replace(/\/+$/, '');
  if (!t.startsWith(`${URL_PREFIX}`)) return null;
  t = t.slice(URL_PREFIX.length).replace(/^\//, ''); // -> route id
  return t;
}

for (const node of nodes.values()) {
  const content = await readFile(filesByRoute.get(node.id)!, 'utf8');
  // strip fenced code blocks so code samples don't create edges
  const body = content.replace(/```[\s\S]*?```/g, '');
  for (const m of body.matchAll(LINK_RE)) {
    const href = m[1];
    if (href.startsWith(`${URL_PREFIX}/`) || href === URL_PREFIX) {
      const target = normalizeDocTarget(href);
      if (target === null) continue;
      if (target === node.id) continue; // self-anchor link
      if (nodes.has(target)) {
        node.out.add(target);
        nodes.get(target)!.in.add(node.id);
      } else {
        node.dangling.push(href);
      }
    } else {
      // cross-section internal link (/toolkits, /reference, /examples, ...)
      node.crossOut.push(href.split('#')[0]);
    }
  }
}

// ---------------------------------------------------------------------------
// Graph algorithms
// ---------------------------------------------------------------------------

const ids = [...nodes.keys()];

// Weakly-connected components (treat edges as undirected)
function weaklyConnectedComponents(): string[][] {
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of ids) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp: string[] = [];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop()!;
      comp.push(n);
      const node = nodes.get(n)!;
      for (const nb of [...node.out, ...node.in]) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    comps.push(comp);
  }
  return comps.sort((a, b) => b.length - a.length);
}

// Reachability from a root over directed out-edges
function reachableFrom(root: string): Set<string> {
  const seen = new Set<string>([root]);
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    for (const nb of nodes.get(n)!.out) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen;
}

// Directed cycles up to length `maxLen` (deduped by canonical rotation)
function shortCycles(maxLen: number): string[][] {
  const found = new Map<string, string[]>();
  const key = (cyc: string[]) => {
    const rots = cyc.map((_, i) => [...cyc.slice(i), ...cyc.slice(0, i)].join('>'));
    return rots.sort()[0];
  };
  const dfs = (start: string, path: string[]) => {
    const last = path[path.length - 1];
    for (const nb of nodes.get(last)!.out) {
      if (nb === start && path.length >= 2) {
        const cyc = [...path];
        found.set(key(cyc), cyc);
      } else if (path.length < maxLen && !path.includes(nb) && nb > start) {
        // nb > start keeps each cycle anchored at its smallest node
        dfs(start, [...path, nb]);
      }
    }
  };
  for (const id of ids) dfs(id, [id]);
  return [...found.values()];
}

const components = weaklyConnectedComponents();
const main = new Set(components[0] ?? []);
const islands = components.slice(1);
const reachFromIndex = nodes.has('') ? reachableFrom('') : new Set<string>();
const cycles = shortCycles(3);

// A short cycle is "concerning" only if its nodes are NOT part of the main
// component (i.e. the loop is itself an island) — embedded loops are fine.
const isolatedCycles = cycles.filter((c) => c.some((n) => !main.has(n)));

// Degree + hubs. A "hub" is a high-degree page (lots of things link to/from it).
const degree = (id: string) => nodes.get(id)!.in.size + nodes.get(id)!.out.size;
const degrees = ids.map(degree).sort((a, b) => a - b);
// top ~15% by degree, with a floor so tiny graphs don't flag everything
const HUB_DEGREE = Math.max(
  Number(opt('hub-degree', '0')) || 0,
  degrees[Math.floor(degrees.length * 0.85)] ?? 0,
  6,
);
const isHub = (id: string) => degree(id) >= HUB_DEGREE;

// Mutual 2-cycles (A->B and B->A) — an immediate circle-back. Benign between
// sibling leaf pages, but a smell between two hubs: flow ping-pongs at the top
// of the graph instead of moving forward. We flag only the hub<->hub ones.
const mutual2: Array<[string, string]> = [];
const seenPair = new Set<string>();
for (const id of ids) {
  for (const t of nodes.get(id)!.out) {
    if (nodes.get(t)!.out.has(id)) {
      const key = [id, t].sort().join('|');
      if (!seenPair.has(key)) {
        seenPair.add(key);
        mutual2.push([id, t].sort() as [string, string]);
      }
    }
  }
}
const hubLoops = mutual2
  .filter(([a, b]) => isHub(a) && isHub(b))
  .sort((x, y) => degree(y[0]) + degree(y[1]) - degree(x[0]) - degree(x[1]));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const totalEdges = ids.reduce((a, id) => a + nodes.get(id)!.out.size, 0);
const orphans = ids.filter(
  (id) => nodes.get(id)!.in.size === 0 && nodes.get(id)!.out.size === 0,
);
const noInbound = ids.filter(
  (id) => id !== '' && nodes.get(id)!.in.size === 0,
);
const unreachable = ids.filter((id) => !reachFromIndex.has(id));

const C = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

console.log(C.bold(`\nDocs link graph — ${ROOT}`));
console.log(
  `${nodes.size} pages · ${totalEdges} internal links · ${components.length} component(s)\n`,
);

console.log(C.bold('Main graph'));
console.log(`  ${main.size}/${nodes.size} pages connected into the main component\n`);

if (islands.length) {
  console.log(C.red(C.bold(`Islands (${islands.length}) — not connected to the main graph`)));
  for (const comp of islands) {
    const kind =
      comp.length === 1 ? 'orphan page' : `${comp.length}-page loop/cluster`;
    console.log(`  ${C.red('●')} ${kind}`);
    for (const n of comp) {
      const node = nodes.get(n)!;
      const outNote = node.crossOut.length
        ? C.dim(` (links out to ${[...new Set(node.crossOut)].slice(0, 3).join(', ')})`)
        : node.out.size || node.in.size
          ? ''
          : C.dim(' (no links at all)');
      console.log(`      ${node.label || 'index'}${outNote}`);
    }
  }
  console.log();
} else {
  console.log(C.green('No islands — every page connects into the main graph.\n'));
}

if (hubLoops.length) {
  console.log(C.red(C.bold(`Hub ping-pong loops (${hubLoops.length})`)));
  console.log(C.dim('  (two high-traffic pages that only circle back to each other — flow should move forward)'));
  for (const [a, b] of hubLoops) {
    console.log(`  ${C.red('⇄')} ${a || 'index'} ⇄ ${b || 'index'} ${C.dim(`(deg ${degree(a)} / ${degree(b)})`)}`);
  }
  console.log();
} else {
  console.log(C.green('No hub ping-pong loops.\n'));
}

if (isolatedCycles.length) {
  console.log(C.yellow(C.bold(`Isolated short cycles (${isolatedCycles.length})`)));
  console.log(C.dim('  (pages that circle straight back without joining the main graph)'));
  for (const c of isolatedCycles) {
    console.log(`  ${C.yellow('↻')} ${c.map((n) => n || 'index').join(' → ')} → ${c[0] || 'index'}`);
  }
  console.log();
}

// Click-reachability from index is only meaningful if index actually links out.
// (Docs here navigate by sidebar, so an index with no body links makes every
// page "unreachable" — that's noise, and index already shows up as an island.)
if (nodes.has('') && nodes.get('')!.out.size === 0) {
  console.log(C.dim('Click-reachability from index: N/A (index has no outbound content links)\n'));
} else if (unreachable.length && nodes.has('')) {
  console.log(C.yellow(C.bold(`Not reachable from index by clicking (${unreachable.length})`)));
  console.log(C.dim('  (in the sidebar, but no content link path from the homepage)'));
  for (const id of unreachable.slice(0, 40)) {
    console.log(`  ${C.yellow('·')} ${id || 'index'}`);
  }
  if (unreachable.length > 40) console.log(C.dim(`  … +${unreachable.length - 40} more`));
  console.log();
}

if (noInbound.length) {
  console.log(C.dim(`Pages with no inbound content links (${noInbound.length}): ${noInbound.slice(0, 12).join(', ')}${noInbound.length > 12 ? ', …' : ''}\n`));
}

// ---------------------------------------------------------------------------
// Optional outputs
// ---------------------------------------------------------------------------

if (flag('json')) {
  const out = {
    nodes: ids.map((id) => ({
      id,
      out: [...nodes.get(id)!.out],
      in: [...nodes.get(id)!.in],
      crossOut: nodes.get(id)!.crossOut,
      dangling: nodes.get(id)!.dangling,
    })),
    components,
    islands,
    isolatedCycles,
    unreachable,
  };
  await writeFile('docs-graph.json', JSON.stringify(out, null, 2));
  console.log(C.dim('Wrote docs-graph.json'));
}

if (flag('dot')) {
  const compIndex = new Map<string, number>();
  components.forEach((c, i) => c.forEach((n) => compIndex.set(n, i)));
  const palette = ['#2563eb', '#dc2626', '#d97706', '#7c3aed', '#059669', '#db2777'];
  const lines = ['digraph docs {', '  rankdir=LR;', '  node [shape=box, style=rounded, fontname="Helvetica"];'];
  for (const id of ids) {
    const ci = compIndex.get(id)!;
    const color = ci === 0 ? '#94a3b8' : palette[(ci - 1) % palette.length];
    const isIsland = ci !== 0;
    lines.push(`  "${id || 'index'}" [color="${color}"${isIsland ? ', penwidth=2, fontcolor="' + color + '"' : ''}];`);
  }
  for (const id of ids) {
    for (const t of nodes.get(id)!.out) {
      lines.push(`  "${id || 'index'}" -> "${t || 'index'}";`);
    }
  }
  lines.push('}');
  await writeFile('docs-graph.dot', lines.join('\n'));
  console.log(C.dim('Wrote docs-graph.dot  (render: dot -Tsvg docs-graph.dot -o docs-graph.svg)'));
}

if (flag('html')) {
  const compIndex = new Map<string, number>();
  components.forEach((c, i) => c.forEach((n) => compIndex.set(n, i)));
  const data = {
    nodes: ids.map((id) => ({
      id: id || 'index',
      comp: compIndex.get(id)!,
      island: compIndex.get(id)! !== 0,
      degree: nodes.get(id)!.in.size + nodes.get(id)!.out.size,
    })),
    edges: ids.flatMap((id) =>
      [...nodes.get(id)!.out].map((t) => ({ from: id || 'index', to: t || 'index' })),
    ),
  };
  const html = `<!doctype html><meta charset=utf8><title>Docs link graph</title>
<style>html,body{margin:0;height:100%;background:#0b0f17;color:#e5e7eb;font-family:system-ui}
#net{height:100vh}#legend{position:fixed;top:12px;left:12px;background:#111827cc;padding:10px 14px;border-radius:8px;font-size:13px;line-height:1.6}</style>
<div id=legend><b>Docs link graph</b><br><span style=color:#94a3b8>●</span> main graph &nbsp; <span style=color:#dc2626>●</span> island (disconnected)<br>node size = link count</div>
<div id=net></div>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<script>
const D=${JSON.stringify(data)};
const palette=['#94a3b8','#dc2626','#d97706','#7c3aed','#059669','#db2777','#2563eb'];
const nodes=new vis.DataSet(D.nodes.map(n=>({id:n.id,label:n.id,value:n.degree+1,
  color:{background:n.island?palette[1+(n.comp-1)%6]:'#334155',border:n.island?palette[1+(n.comp-1)%6]:'#64748b'},
  font:{color:n.island?'#fca5a5':'#cbd5e1'}})));
const edges=new vis.DataSet(D.edges.map(e=>({from:e.from,to:e.to,arrows:'to',color:{color:'#33415588'}})));
new vis.Network(document.getElementById('net'),{nodes,edges},{
  physics:{stabilization:true,barnesHut:{gravitationalConstant:-8000,springLength:120}},
  nodes:{shape:'dot',scaling:{min:6,max:40}},interaction:{hover:true}});
</script>`;
  await writeFile('docs-graph.html', html);
  console.log(C.dim('Wrote docs-graph.html  (open in a browser)'));
}

// exit non-zero if there are islands, so this can gate CI
if (flag('check') && (islands.length || isolatedCycles.length || hubLoops.length)) {
  process.exit(1);
}
